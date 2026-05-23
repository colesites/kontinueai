import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const EXPORT_TTL_MS = 14 * 86_400_000;

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

// Returns recent exports for the current user. Download URLs are minted by the
// Node-runtime action `getDownloadUrl` so they can be signed against R2 — this
// query just reports row state.
export const listExports = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("dataExports")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(20);
    return rows.map((row) => ({
      _id: row._id,
      format: row.format,
      status: row.status,
      byteSize: row.byteSize ?? null,
      conversationCount: row.conversationCount ?? null,
      memoryCount: row.memoryCount ?? null,
      summaryCount: row.summaryCount ?? null,
      errorMessage: row.errorMessage ?? null,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      hasFile: row.status === "ready" && !!row.objectKey,
    }));
  },
});

export const requestExport = mutation({
  args: {
    format: v.union(v.literal("json"), v.literal("markdown"), v.literal("zip")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const inFlight = await ctx.db
      .query("dataExports")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .filter((q) => q.eq(q.field("status"), "processing"))
      .first();
    if (inFlight) {
      throw new ConvexError({
        code: "EXPORT_IN_PROGRESS",
        message: "An export is already being prepared.",
      });
    }

    const now = Date.now();
    const exportId = await ctx.db.insert("dataExports", {
      ownerId: user._id,
      format: args.format,
      status: "processing",
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.exportsWorker.generateExportFile, {
      exportId,
    });

    return { exportId };
  },
});

export const deleteExport = mutation({
  args: { exportId: v.id("dataExports") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.exportId);
    if (!row || row.ownerId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Export not found." });
    }
    await ctx.db.delete(args.exportId);
    if (row.objectKey) {
      await ctx.scheduler.runAfter(0, internal.exportsWorker.deleteExportObject, {
        objectKey: row.objectKey,
      });
    }
  },
});

// ── internal helpers used by the Node-runtime worker ─────────────────────

export const collectExportData = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User missing." });
    }

    const [chats, memories, summaries] = await Promise.all([
      ctx.db
        .query("chats")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
        .collect(),
      ctx.db
        .query("memories")
        .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("memorySummaries")
        .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
        .collect(),
    ]);

    const chatsWithMessages: Array<{
      chat: Doc<"chats">;
      messages: Doc<"messages">[];
    }> = await Promise.all(
      chats.map(async (chat) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_chat_order", (q) => q.eq("chatId", chat._id))
          .collect();
        return { chat, messages };
      }),
    );

    return {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name ?? null,
        plan: user.plan ?? null,
        createdAt: user.createdAt,
      },
      chats: chatsWithMessages,
      memories,
      summaries,
    };
  },
});

export const markExportReady = internalMutation({
  args: {
    exportId: v.id("dataExports"),
    objectKey: v.string(),
    byteSize: v.number(),
    conversationCount: v.number(),
    memoryCount: v.number(),
    summaryCount: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.exportId);
    if (!row) return;
    const now = Date.now();
    await ctx.db.patch(args.exportId, {
      status: "ready",
      objectKey: args.objectKey,
      byteSize: args.byteSize,
      conversationCount: args.conversationCount,
      memoryCount: args.memoryCount,
      summaryCount: args.summaryCount,
      completedAt: now,
      expiresAt: now + EXPORT_TTL_MS,
    });
  },
});

export const markExportFailed = internalMutation({
  args: {
    exportId: v.id("dataExports"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.exportId);
    if (!row) return;
    await ctx.db.patch(args.exportId, {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 500),
      completedAt: Date.now(),
    });
  },
});

export const getExportMeta = internalQuery({
  args: { exportId: v.id("dataExports") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.exportId);
    if (!row) return null;
    return {
      ownerId: row.ownerId,
      format: row.format,
      objectKey: row.objectKey ?? null,
      status: row.status,
    };
  },
});
