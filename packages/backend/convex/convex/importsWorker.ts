"use node";

import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createPresignedUploadUrl,
  deleteObject,
  getObjectBytes,
  importKey,
  parsedKey,
  putObjectBytes,
} from "./r2";
import {
  parseChatGptExport,
  planImportChunks,
  sortConversationsForImport,
  type ParsedConversation,
} from "./importParsers";

const MAX_CONVERSATIONS_PER_CHUNK_RUN = 25;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // hard ceiling (Pro plan)

// Public action: returns a presigned PUT URL bound to a freshly-created job row.
// The job row itself is created by the `prepareImport` mutation (which enforces
// plan-tier upload limits); this action only signs the URL for it.
export const createUploadUrl = action({
  args: { jobId: v.id("importJobs") },
  handler: async (
    ctx,
    args,
  ): Promise<{ uploadUrl: string; objectKey: string }> => {
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated." });
    }

    const job = await ctx.runQuery(internal.imports.getJobInternal, {
      jobId: args.jobId,
    });
    if (!job || job.ownerId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Import not found." });
    }
    if (job.currentStage !== "awaiting_upload" || job.status !== "queued") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "This import is no longer awaiting an upload.",
      });
    }
    if (!job.uploadByteSize || job.uploadByteSize <= 0) {
      throw new ConvexError({
        code: "INVALID_UPLOAD_SIZE",
        message: "Upload size missing on job.",
      });
    }

    // Derive the extension from the filename; default to .json. The key is
    // namespaced by userId so cross-user paths are impossible.
    const ext = (job.sourceFilename ?? "").split(".").pop() ?? "json";
    const key = importKey(user._id, args.jobId, ext);
    const contentType = job.sourceContentType ?? "application/json";
    const uploadUrl = await createPresignedUploadUrl({
      key,
      contentType,
      contentLength: job.uploadByteSize,
    });

    await ctx.runMutation(internal.imports.setJobStage, {
      jobId: args.jobId,
      sourceObjectKey: key,
    });

    return { uploadUrl, objectKey: key };
  },
});

export const parseAndPlan = internalAction({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.imports.getJobInternal, {
      jobId: args.jobId,
    });
    if (!job) return;
    if (job.status === "canceled") return;
    if (!job.sourceObjectKey) {
      await ctx.runMutation(internal.imports.setJobStage, {
        jobId: args.jobId,
        status: "failed",
        currentStage: "done",
        errorMessage: "Upload was never confirmed.",
        completedAt: Date.now(),
      });
      return;
    }

    await ctx.runMutation(internal.imports.setJobStage, {
      jobId: args.jobId,
      status: "processing",
      currentStage: "parsing",
    });

    try {
      const bytes = await getObjectBytes(job.sourceObjectKey);
      if (bytes.byteLength > MAX_FILE_BYTES) {
        throw new Error(`Uploaded file is too large (${bytes.byteLength} bytes).`);
      }
      const text = new TextDecoder().decode(bytes);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error(
          "Could not parse the upload as JSON. Make sure you uploaded the conversations.json file.",
        );
      }

      let conversations: ParsedConversation[];
      switch (job.provider) {
        case "chatgpt":
          conversations = parseChatGptExport(raw);
          break;
        case "kontinue":
          conversations = parseKontinueExport(raw);
          break;
        default:
          throw new Error(`Unsupported provider: ${job.provider}`);
      }

      conversations = sortConversationsForImport(conversations);
      if (conversations.length === 0) {
        await ctx.runMutation(internal.imports.setJobStage, {
          jobId: args.jobId,
          status: "completed",
          currentStage: "done",
          totalConversations: 0,
          totalChunks: 0,
          completedAt: Date.now(),
          errorMessage: "No conversations found in the upload.",
        });
        await deleteObject(job.sourceObjectKey);
        return;
      }

      // Persist the normalized list back to R2 so chunk workers can stream it
      // without re-parsing the (potentially huge) raw upload.
      const parsedObjectKey = parsedKey(job.ownerId, args.jobId);
      const parsedBytes = new TextEncoder().encode(JSON.stringify(conversations));
      await putObjectBytes({
        key: parsedObjectKey,
        body: parsedBytes,
        contentType: "application/json",
      });

      // Remove the raw upload — no longer needed.
      await deleteObject(job.sourceObjectKey);

      const chunks = planImportChunks(conversations);
      await ctx.runMutation(internal.imports.insertChunkPlan, {
        jobId: args.jobId,
        ownerId: job.ownerId,
        chunks: chunks.map((chunk) => ({
          chunkType: chunk.chunkType,
          priority: chunk.priority,
          rangeStart: chunk.rangeStart,
          rangeEnd: chunk.rangeEnd,
          conversationCount: chunk.rangeEnd - chunk.rangeStart,
        })),
      });

      await ctx.runMutation(internal.imports.setJobStage, {
        jobId: args.jobId,
        currentStage: "phase1",
        totalConversations: conversations.length,
        totalChunks: chunks.length,
        sourceObjectKey: parsedObjectKey,
      });

      await ctx.scheduler.runAfter(0, internal.importsWorker.processNextChunk, {
        jobId: args.jobId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      console.error("import parsing failed", error);
      await ctx.runMutation(internal.imports.setJobStage, {
        jobId: args.jobId,
        status: "failed",
        currentStage: "done",
        errorMessage: message,
        completedAt: Date.now(),
      });
    }
  },
});

export const processNextChunk = internalAction({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.imports.getJobInternal, {
      jobId: args.jobId,
    });
    if (!job) return;
    if (job.status === "canceled" || job.status === "failed") return;
    if (!job.sourceObjectKey) return;

    const chunk = await ctx.runMutation(internal.imports.claimNextChunk, {
      jobId: args.jobId,
    });
    if (!chunk) {
      // No work left. Clean up the parsed-list blob.
      if (job.sourceObjectKey) {
        await deleteObject(job.sourceObjectKey);
      }
      return;
    }

    try {
      const bytes = await getObjectBytes(job.sourceObjectKey);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as ParsedConversation[];
      if (!Array.isArray(parsed)) {
        throw new Error("Parsed conversation list is corrupted.");
      }

      const slice = parsed.slice(chunk.rangeStart, chunk.rangeEnd);
      const conversationsToProcess = slice.slice(0, MAX_CONVERSATIONS_PER_CHUNK_RUN);
      let insertedMessages = 0;
      let processed = 0;

      for (const conversation of conversationsToProcess) {
        const result = await ctx.runMutation(
          internal.imports.insertImportedConversation,
          {
            ownerId: job.ownerId,
            provider: job.provider,
            title: conversation.title,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messages: conversation.messages,
          },
        );
        insertedMessages += result.insertedMessages;
        processed += 1;
      }

      // If we couldn't process the entire chunk in one run, queue a follow-up
      // for the remainder before marking this one done.
      const fullyDone = conversationsToProcess.length === slice.length;
      if (!fullyDone) {
        const remainingStart = chunk.rangeStart + conversationsToProcess.length;
        await ctx.runMutation(internal.imports.insertChunkPlan, {
          jobId: args.jobId,
          ownerId: job.ownerId,
          chunks: [
            {
              chunkType: chunk.chunkType,
              priority: chunk.priority,
              rangeStart: remainingStart,
              rangeEnd: chunk.rangeEnd,
              conversationCount: chunk.rangeEnd - remainingStart,
            },
          ],
        });
      }

      await ctx.runMutation(internal.imports.finishChunk, {
        jobId: args.jobId,
        chunkId: chunk._id,
        outcome: "done",
        insertedMessages,
        processedConversations: processed,
      });

      await ctx.scheduler.runAfter(0, internal.importsWorker.processNextChunk, {
        jobId: args.jobId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chunk failed.";
      console.error("import chunk failed", error);
      await ctx.runMutation(internal.imports.finishChunk, {
        jobId: args.jobId,
        chunkId: chunk._id,
        outcome: "failed",
        insertedMessages: 0,
        processedConversations: 0,
        errorMessage: message,
      });
      await ctx.scheduler.runAfter(2000, internal.importsWorker.processNextChunk, {
        jobId: args.jobId,
      });
    }
  },
});

export const cleanupCanceledJob = internalAction({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.imports.getJobInternal, {
      jobId: args.jobId,
    });
    if (!job) return;
    if (job.sourceObjectKey) {
      await deleteObject(job.sourceObjectKey);
    }
    const parsedObjectKey = parsedKey(job.ownerId, args.jobId);
    await deleteObject(parsedObjectKey);
  },
});

function parseKontinueExport(raw: unknown): ParsedConversation[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Kontinue export: expected an object.");
  }
  const payload = raw as {
    conversations?: Array<{
      id?: string;
      title?: string;
      createdAt?: number;
      updatedAt?: number;
      messages?: Array<{
        role?: string;
        content?: string;
        createdAt?: number;
      }>;
    }>;
  };
  const conversations = Array.isArray(payload.conversations)
    ? payload.conversations
    : [];

  const out: ParsedConversation[] = [];
  for (const entry of conversations) {
    const messages: ParsedConversation["messages"] = [];
    for (const message of entry.messages ?? []) {
      const role: ParsedConversation["messages"][number]["role"] | null =
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system"
          ? message.role
          : null;
      if (!role) continue;
      const content = (message.content ?? "").trim();
      if (!content) continue;
      messages.push({
        role,
        content,
        createdAt: typeof message.createdAt === "number" ? message.createdAt : 0,
      });
    }
    if (messages.length === 0) continue;
    const createdAt =
      typeof entry.createdAt === "number" ? entry.createdAt : Date.now();
    const updatedAt =
      typeof entry.updatedAt === "number" ? entry.updatedAt : createdAt;
    out.push({
      externalId: entry.id ?? `${createdAt}-${Math.random()}`,
      title: entry.title?.trim() || "Imported conversation",
      createdAt,
      updatedAt,
      messages,
    });
  }
  return out;
}
