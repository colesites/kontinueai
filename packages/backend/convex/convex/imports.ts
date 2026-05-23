import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
// `Doc` is used by assertUploadAllowed below.
import {
  getImportUploadLimitBytes,
  type PlanTier,
} from "@repo/core/plan-tier";
import { getPersistedPlanTier } from "../lib/plan";

const IMPORT_PROVIDERS = ["chatgpt", "claude", "kontinue"] as const;
const MAX_RETRIES = 3;
const MIN_UPLOAD_BYTES = 1; // any positive size

async function requireUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated." });
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) {
    throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
  }
  return user;
}

// Plan-tier gate. Source of truth for how big a single import upload may be.
function assertUploadAllowed(user: Doc<"users">, contentLength: number) {
  if (!Number.isFinite(contentLength) || contentLength < MIN_UPLOAD_BYTES) {
    throw new ConvexError({
      code: "INVALID_UPLOAD_SIZE",
      message: "Upload size is invalid.",
    });
  }
  const planTier: PlanTier = getPersistedPlanTier(user.plan);
  const limit = getImportUploadLimitBytes(planTier);
  if (contentLength > limit) {
    throw new ConvexError({
      code: "UPLOAD_TOO_LARGE",
      message: `File exceeds your ${planTier} plan upload limit (${Math.round(
        limit / (1024 * 1024),
      )} MB). Upgrade your plan or split the export.`,
    });
  }
}

// Returns a signed PUT URL for the browser to upload the export directly to R2,
// plus the importJobs row id the URL is bound to. The job sits in `queued`
// until `confirmImportUpload` is called.
export const prepareImport = mutation({
  args: {
    provider: v.union(
      v.literal("chatgpt"),
      v.literal("claude"),
      v.literal("kontinue"),
    ),
    filename: v.optional(v.string()),
    contentLength: v.number(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ jobId: Id<"importJobs"> }> => {
    const user = await requireUser(ctx);
    assertUploadAllowed(user, args.contentLength);

    // Block additional jobs while one is active.
    const active = await ctx.db
      .query("importJobs")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "queued"),
          q.eq(q.field("status"), "processing"),
        ),
      )
      .first();
    if (active) {
      throw new ConvexError({
        code: "IMPORT_IN_PROGRESS",
        message: "An import is already running. Cancel it before starting another.",
      });
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("importJobs", {
      ownerId: user._id,
      provider: args.provider,
      sourceFilename: args.filename,
      sourceContentType: args.contentType,
      uploadByteSize: args.contentLength,
      status: "queued",
      currentStage: "awaiting_upload",
      totalConversations: 0,
      processedConversations: 0,
      importedMessages: 0,
      totalChunks: 0,
      completedChunks: 0,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { jobId };
  },
});

// Browser calls this after a successful PUT to R2. Schedules the parser.
export const confirmImportUpload = mutation({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Import not found." });
    }
    if (job.status !== "queued" || job.currentStage !== "awaiting_upload") {
      // Idempotent — already kicked off.
      return;
    }
    await ctx.db.patch(args.jobId, {
      currentStage: "parsing",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.importsWorker.parseAndPlan, {
      jobId: args.jobId,
    });
  },
});

export const cancelImport = mutation({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Import not found." });
    }
    if (job.status === "completed" || job.status === "failed" || job.status === "canceled") {
      return;
    }
    await ctx.db.patch(args.jobId, {
      status: "canceled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    // Best-effort: ask the worker (Node runtime) to clean R2 objects.
    await ctx.scheduler.runAfter(0, internal.importsWorker.cleanupCanceledJob, {
      jobId: args.jobId,
    });
  },
});

export const listImportJobs = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("importJobs")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(10);
  },
});

export const getImportJob = query({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerId !== user._id) return null;

    const chunks = await ctx.db
      .query("importChunks")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    const phase1Total = chunks.filter((c) => c.priority < 3).length;
    const phase1Done = chunks.filter((c) => c.priority < 3 && c.status === "done").length;
    const phase2Total = chunks.filter((c) => c.priority === 3).length;
    const phase2Done = chunks.filter((c) => c.priority === 3 && c.status === "done").length;
    const inFlight = chunks.find((c) => c.status === "processing") ?? null;

    return {
      job,
      phase1: { total: phase1Total, done: phase1Done },
      phase2: { total: phase2Total, done: phase2Done },
      currentChunk: inFlight
        ? {
            chunkType: inFlight.chunkType,
            rangeStart: inFlight.rangeStart,
            rangeEnd: inFlight.rangeEnd,
            conversationCount: inFlight.conversationCount,
          }
        : null,
    };
  },
});

// Exposed so the UI can show the right limit before the user picks a file.
export const getUploadLimit = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const planTier: PlanTier = getPersistedPlanTier(user.plan);
    return {
      planTier,
      limitBytes: getImportUploadLimitBytes(planTier),
    };
  },
});

// ── internal helpers used by the Node worker ────────────────────────────

export const getJobInternal = internalQuery({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const setJobStage = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("canceled"),
      ),
    ),
    currentStage: v.optional(v.string()),
    totalConversations: v.optional(v.number()),
    totalChunks: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    sourceObjectKey: v.optional(v.string()),
    phase1CompletedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.currentStage !== undefined) patch.currentStage = args.currentStage;
    if (args.totalConversations !== undefined)
      patch.totalConversations = args.totalConversations;
    if (args.totalChunks !== undefined) patch.totalChunks = args.totalChunks;
    if (args.errorMessage !== undefined)
      patch.errorMessage = args.errorMessage.slice(0, 500);
    if (args.sourceObjectKey !== undefined)
      patch.sourceObjectKey = args.sourceObjectKey;
    if (args.phase1CompletedAt !== undefined)
      patch.phase1CompletedAt = args.phase1CompletedAt;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
    await ctx.db.patch(args.jobId, patch);
  },
});

export const insertChunkPlan = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    ownerId: v.id("users"),
    chunks: v.array(
      v.object({
        chunkType: v.union(
          v.literal("oldest"),
          v.literal("newest"),
          v.literal("middle"),
        ),
        priority: v.number(),
        rangeStart: v.number(),
        rangeEnd: v.number(),
        conversationCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const chunk of args.chunks) {
      await ctx.db.insert("importChunks", {
        jobId: args.jobId,
        ownerId: args.ownerId,
        priority: chunk.priority,
        chunkType: chunk.chunkType,
        status: "pending",
        rangeStart: chunk.rangeStart,
        rangeEnd: chunk.rangeEnd,
        conversationCount: chunk.conversationCount,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const claimNextChunk = internalMutation({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.status === "canceled" || job.status === "failed") return null;

    const allPending = await ctx.db
      .query("importChunks")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    allPending.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.rangeStart - b.rangeStart;
    });
    const next = allPending[0];
    if (!next) return null;

    await ctx.db.patch(next._id, {
      status: "processing",
      updatedAt: Date.now(),
    });
    return next;
  },
});

export const insertImportedConversation = internalMutation({
  args: {
    ownerId: v.id("users"),
    provider: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    messages: v.array(
      v.object({
        role: v.union(
          v.literal("system"),
          v.literal("user"),
          v.literal("assistant"),
        ),
        content: v.string(),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.messages.length === 0) {
      return { insertedMessages: 0 };
    }

    const chatId = await ctx.db.insert("chats", {
      ownerId: args.ownerId,
      title: args.title.slice(0, 200),
      archived: false,
      lastMessageAt: args.updatedAt,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      source: {
        provider: args.provider,
        importedAt: Date.now(),
        importMethod: "manual",
      },
    });

    let order = 0;
    for (const message of args.messages) {
      await ctx.db.insert("messages", {
        chatId,
        ownerId: args.ownerId,
        role: message.role,
        content: message.content,
        tokenCount: Math.ceil(message.content.length / 4),
        createdAt: message.createdAt || args.createdAt,
        order,
        metadata: {
          tokenCount: Math.ceil(message.content.length / 4),
          isImported: true,
        },
      });
      order += 1;
    }

    return { insertedMessages: args.messages.length };
  },
});

export const finishChunk = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    chunkId: v.id("importChunks"),
    outcome: v.union(v.literal("done"), v.literal("failed")),
    insertedMessages: v.number(),
    processedConversations: v.number(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db.get(args.chunkId);
    const job = await ctx.db.get(args.jobId);
    if (!chunk || !job) return null;

    const now = Date.now();

    if (args.outcome === "failed") {
      const retryCount = chunk.retryCount + 1;
      if (retryCount < MAX_RETRIES) {
        await ctx.db.patch(args.chunkId, {
          status: "pending",
          retryCount,
          errorMessage: args.errorMessage?.slice(0, 300),
          updatedAt: now,
        });
        return { retried: true };
      }
      await ctx.db.patch(args.chunkId, {
        status: "failed",
        retryCount,
        errorMessage: args.errorMessage?.slice(0, 300),
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.chunkId, {
        status: "done",
        updatedAt: now,
      });
    }

    const allChunks = await ctx.db
      .query("importChunks")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
    const completedChunks = allChunks.filter((c) => c.status === "done").length;
    const failedChunks = allChunks.filter((c) => c.status === "failed").length;
    const remaining = allChunks.length - completedChunks - failedChunks;

    const processedConversations =
      (job.processedConversations ?? 0) + args.processedConversations;
    const importedMessages = (job.importedMessages ?? 0) + args.insertedMessages;
    const progress =
      allChunks.length === 0 ? 0 : completedChunks / allChunks.length;

    const phase1Pending = allChunks.some(
      (c) => c.priority < 3 && c.status !== "done" && c.status !== "failed",
    );
    const justFinishedPhase1 =
      !phase1Pending && !job.phase1CompletedAt && completedChunks > 0;

    const patch: Record<string, unknown> = {
      processedConversations,
      importedMessages,
      completedChunks,
      progress,
      updatedAt: now,
    };
    if (justFinishedPhase1) {
      patch.phase1CompletedAt = now;
      patch.currentStage = "phase2";
    }
    if (remaining === 0) {
      patch.status = failedChunks === allChunks.length ? "failed" : "completed";
      patch.currentStage = "done";
      patch.completedAt = now;
    }
    await ctx.db.patch(args.jobId, patch);

    return { remaining, completedChunks, failedChunks };
  },
});

export const getProviders = query({
  args: {},
  handler: async () => IMPORT_PROVIDERS,
});
