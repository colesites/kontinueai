import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  clampImportanceScore,
  computeMemoryQuotaState,
  estimateMemoryByteSize,
  formatBytes,
  getMemoryLimitBytesForPlan,
  tokenizeForKeywordSearch,
  type MemoryType,
} from "@repo/core/memory";

type ExtractedMemoryEntry = {
  type: MemoryType;
  content: string;
  keywords: string[];
  embedding: number[];
  importanceScore: number;
  sourceMessageIds: Id<"messages">[];
  pinned?: boolean;
  manuallySaved?: boolean;
};

function normalizeMemoryContent(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function compressMemoryContent(content: string): string | undefined {
  const trimmed = content.trim();
  if (trimmed.length <= 280) return undefined;
  const start = trimmed.slice(0, 180).trimEnd();
  const end = trimmed.slice(-80).trimStart();
  return `${start} ... ${end}`;
}

function isProtectedMemory(memory: Doc<"memories">): boolean {
  return memory.pinned || memory.manuallySaved || memory.type === "preference";
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function getUserMemoryLimitBytes(user: { plan?: string | null; memoryLimitBytes?: number | null }) {
  return user.memoryLimitBytes ?? getMemoryLimitBytesForPlan(user.plan);
}

function getUserMemoryUsedBytes(user: { memoryUsedBytes?: number | null }) {
  return user.memoryUsedBytes ?? 0;
}

async function requireCurrentUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Not authenticated.",
    });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkUserId", identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "User not found.",
    });
  }

  return user;
}

async function recomputeUserMemoryUsage(ctx: any, userId: Id<"users">) {
  const [memories, summaries] = await Promise.all([
    ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q: any) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("memorySummaries")
      .withIndex("by_user_updated", (q: any) => q.eq("userId", userId))
      .collect(),
  ]);
  const usedBytes =
    memories.reduce((sum: number, memory: Doc<"memories">) => sum + memory.byteSize, 0) +
    summaries.reduce(
      (sum: number, summary: Doc<"memorySummaries">) => sum + summary.byteSize,
      0,
    );
  await ctx.db.patch(userId, {
    memoryUsedBytes: usedBytes,
    updatedAt: Date.now(),
  });
  return usedBytes;
}

async function tryFreeSpace(ctx: any, userId: Id<"users">, requiredBytes: number) {
  const user = await ctx.db.get(userId);
  if (!user) return false;
  const currentQuota = computeMemoryQuotaState({
    usedBytes: getUserMemoryUsedBytes(user),
    limitBytes: getUserMemoryLimitBytes(user),
  });
  if (currentQuota.remainingBytes >= requiredBytes) return true;

  const candidates = await ctx.db
    .query("memories")
    .withIndex("by_user_last_accessed", (q: any) => q.eq("userId", userId))
    .collect();

  for (const candidate of candidates) {
    if (isProtectedMemory(candidate)) continue;

    if (!candidate.compressedContent && candidate.content.length > 280) {
      const compressedContent = compressMemoryContent(candidate.content);
      if (compressedContent) {
        const nextByteSize = estimateMemoryByteSize({
          content: candidate.content,
          compressedContent,
          embeddingLength: candidate.embedding.length,
          metadata: {
            type: candidate.type,
            pinned: candidate.pinned,
            sourceMessageIds: candidate.sourceMessageIds,
          },
        });
        await ctx.db.patch(candidate._id, {
          compressedContent,
          byteSize: nextByteSize,
          updatedAt: Date.now(),
        });
      }
    } else if (
      candidate.type === "context" &&
      candidate.importanceScore < 0.35 &&
      !candidate.archived
    ) {
      await ctx.db.delete(candidate._id);
    }

    const usedBytes = await recomputeUserMemoryUsage(ctx, userId);
    if (getUserMemoryLimitBytes(user) - usedBytes >= requiredBytes) {
      return true;
    }
  }

  const finalUser = await ctx.db.get(userId);
  if (!finalUser) return false;
  return (
    getUserMemoryLimitBytes(finalUser) - getUserMemoryUsedBytes(finalUser) >=
    requiredBytes
  );
}

export const getMemoryStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const quota = computeMemoryQuotaState({
      usedBytes: getUserMemoryUsedBytes(user),
      limitBytes: getUserMemoryLimitBytes(user),
    });
    const [memoryCount, pinnedCount, summaryCount] = await Promise.all([
      ctx.db
        .query("memories")
        .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("memories")
        .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("memorySummaries")
        .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    return {
      ...quota,
      usedBytesLabel: formatBytes(quota.usedBytes),
      limitBytesLabel: formatBytes(quota.limitBytes),
      memoryCount: memoryCount.length,
      pinnedCount: pinnedCount.filter((memory) => memory.pinned).length,
      summaryCount: summaryCount.length,
    };
  },
});

export const canStoreMemory = query({
  args: {
    requiredBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const quota = computeMemoryQuotaState({
      usedBytes: getUserMemoryUsedBytes(user),
      limitBytes: getUserMemoryLimitBytes(user),
    });
    const requiredBytes = Math.max(0, args.requiredBytes ?? 0);
    return {
      ...quota,
      canStore: quota.remainingBytes >= requiredBytes,
      requiredBytes,
    };
  },
});

export const canStoreMemoryForUser = internalQuery({
  args: {
    userId: v.id("users"),
    requiredBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    return (
      getUserMemoryUsedBytes(user) + args.requiredBytes <=
      getUserMemoryLimitBytes(user)
    );
  },
});

export const listDashboardMemories = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const search = args.search?.trim() ?? "";

    const memories =
      search.length > 0
        ? await ctx.db
            .query("memories")
            .withSearchIndex("search_content", (q) =>
              q.search("content", search).eq("userId", user._id).eq("archived", false),
            )
            .take(limit * 2)
        : await ctx.db
            .query("memories")
            .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
            .order("desc")
            .take(limit * 2);

    return memories
      .filter((memory) => !memory.archived)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      })
      .slice(0, limit);
  },
});

export const getMemoryTypes = query({
  args: {},
  handler: async () => {
    return [
      "preference",
      "personal_fact",
      "project",
      "long_term",
      "summary",
      "workflow",
      "relationship",
      "context",
    ] as const;
  },
});

export const pinMemory = mutation({
  args: {
    memoryId: v.id("memories"),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Memory not found.",
      });
    }

    await ctx.db.patch(args.memoryId, {
      pinned: args.pinned,
      lastAccessedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteMemory = mutation({
  args: {
    memoryId: v.id("memories"),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.userId !== user._id) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Memory not found.",
      });
    }

    await ctx.db.delete(args.memoryId);
    await recomputeUserMemoryUsage(ctx, user._id);
  },
});

export const getMessageWindowForExtraction = internalQuery({
  args: {
    chatId: v.id("chats"),
    messageId: v.id("messages"),
    windowSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    const chat = await ctx.db.get(args.chatId);
    if (!message || !chat) return null;
    const user = await ctx.db.get(chat.ownerId);
    if (!user) return null;

    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .collect();

    const messageIndex = allMessages.findIndex((entry) => entry._id === args.messageId);
    const windowSize = Math.min(Math.max(args.windowSize ?? 6, 2), 12);
    const sliceStart = Math.max(0, messageIndex - windowSize + 1);
    const window = allMessages.slice(sliceStart, messageIndex + 1);

    return {
      user,
      chat,
      targetMessage: message,
      messages: window,
    };
  },
});

export const getConversationMessagesForSummary = internalQuery({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;
    const user = await ctx.db.get(chat.ownerId);
    if (!user) return null;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .collect();
    return { user, chat, messages };
  },
});

export const getMemoryDocsByIds = internalQuery({
  args: {
    memoryIds: v.array(v.id("memories")),
    summaryIds: v.array(v.id("memorySummaries")),
  },
  handler: async (ctx, args) => {
    const [memories, summaries] = await Promise.all([
      Promise.all(args.memoryIds.map((id) => ctx.db.get(id))),
      Promise.all(args.summaryIds.map((id) => ctx.db.get(id))),
    ]);
    return {
      memories: memories.filter(isDefined),
      summaries: summaries.filter(isDefined),
    };
  },
});

export const searchMemoriesByKeywords = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalized = args.query.trim();
    if (!normalized) return [];
    return await ctx.db
      .query("memories")
      .withSearchIndex("search_content", (q) =>
        q.search("content", normalized).eq("userId", args.userId).eq("archived", false),
      )
      .take(Math.min(Math.max(args.limit ?? 8, 1), 20));
  },
});

export const getMemoriesForSummaryPeriods = internalQuery({
  args: {
    userId: v.id("users"),
    dayStart: v.number(),
    weekStart: v.number(),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      dayMemories: memories.filter((memory) => memory.updatedAt >= args.dayStart),
      weekMemories: memories.filter((memory) => memory.updatedAt >= args.weekStart),
    };
  },
});

export const getUserMemoriesForMaintenance = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
      .collect();
    return {
      user,
      memories,
    };
  },
});

export const touchMemories = internalMutation({
  args: {
    memoryIds: v.array(v.id("memories")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await Promise.all(
      args.memoryIds.map(async (memoryId) => {
        const memory = await ctx.db.get(memoryId);
        if (!memory) return;
        await ctx.db.patch(memoryId, {
          lastAccessedAt: now,
          updatedAt: now,
        });
      }),
    );
  },
});

export const upsertExtractedMemories = internalMutation({
  args: {
    userId: v.id("users"),
    chatId: v.optional(v.id("chats")),
    entries: v.array(
      v.object({
        type: v.union(
          v.literal("preference"),
          v.literal("personal_fact"),
          v.literal("project"),
          v.literal("long_term"),
          v.literal("summary"),
          v.literal("workflow"),
          v.literal("relationship"),
          v.literal("context"),
        ),
        content: v.string(),
        keywords: v.array(v.string()),
        embedding: v.array(v.number()),
        importanceScore: v.number(),
        sourceMessageIds: v.array(v.id("messages")),
        pinned: v.optional(v.boolean()),
        manuallySaved: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let storedCount = 0;
    let skippedForQuota = false;
    let skippedDuplicates = 0;

    const existingMemories = await ctx.db
      .query("memories")
      .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
      .collect();

    for (const entry of args.entries as ExtractedMemoryEntry[]) {
      const content = entry.content.trim();
      if (!content) continue;
      const normalizedContent = normalizeMemoryContent(content);
      const existing = existingMemories.find(
        (memory) =>
          memory.type === entry.type &&
          (memory.normalizedContent === normalizedContent ||
            normalizedContent.includes(memory.normalizedContent) ||
            memory.normalizedContent.includes(normalizedContent)),
      );

      if (existing) {
        const mergedKeywords = Array.from(
          new Set([...existing.keywords, ...entry.keywords, ...tokenizeForKeywordSearch(content)]),
        ).slice(0, 20);
        await ctx.db.patch(existing._id, {
          content: existing.content.length >= content.length ? existing.content : content,
          keywords: mergedKeywords,
          importanceScore: Math.max(existing.importanceScore, clampImportanceScore(entry.importanceScore)),
          sourceMessageIds: Array.from(
            new Set([...existing.sourceMessageIds, ...entry.sourceMessageIds]),
          ),
          lastAccessedAt: now,
          updatedAt: now,
        });
        skippedDuplicates += 1;
        continue;
      }

      const compressedContent = compressMemoryContent(content);
      const byteSize = estimateMemoryByteSize({
        content,
        compressedContent,
        embeddingLength: entry.embedding.length,
        metadata: {
          type: entry.type,
          keywords: entry.keywords,
          sourceMessageIds: entry.sourceMessageIds,
        },
      });

      const hasCapacity = await tryFreeSpace(ctx, args.userId, byteSize);
      if (!hasCapacity) {
        skippedForQuota = true;
        continue;
      }

      await ctx.db.insert("memories", {
        userId: args.userId,
        type: entry.type,
        content,
        normalizedContent,
        compressedContent,
        keywords: Array.from(
          new Set([...entry.keywords, ...tokenizeForKeywordSearch(content)]),
        ).slice(0, 20),
        embedding: entry.embedding,
        importanceScore: clampImportanceScore(entry.importanceScore),
        pinned: entry.pinned ?? false,
        manuallySaved: entry.manuallySaved ?? false,
        archived: false,
        sourceChatId: args.chatId,
        sourceMessageIds: entry.sourceMessageIds,
        byteSize,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
      });
      storedCount += 1;
    }

    const usedBytes = await recomputeUserMemoryUsage(ctx, args.userId);
    const user = await ctx.db.get(args.userId);
    const quota = computeMemoryQuotaState({
      usedBytes,
      limitBytes: user ? getUserMemoryLimitBytes(user) : 1,
    });

    return {
      storedCount,
      skippedDuplicates,
      skippedForQuota,
      quota,
    };
  },
});

export const createManualMemory = mutation({
  args: {
    type: v.union(
      v.literal("preference"),
      v.literal("personal_fact"),
      v.literal("project"),
      v.literal("long_term"),
      v.literal("summary"),
      v.literal("workflow"),
      v.literal("relationship"),
      v.literal("context"),
    ),
    content: v.string(),
    pinned: v.optional(v.boolean()),
  },
  handler: async () => {
    throw new ConvexError({
      code: "USE_ACTION",
      message: "Manual memory creation must go through the memory action.",
    });
  },
});

export const applyMaintenanceChanges = internalMutation({
  args: {
    userId: v.id("users"),
    compressUpdates: v.array(
      v.object({
        memoryId: v.id("memories"),
        compressedContent: v.string(),
        byteSize: v.number(),
      }),
    ),
    archiveMemoryIds: v.array(v.id("memories")),
    deleteMemoryIds: v.array(v.id("memories")),
    duplicateMerges: v.array(
      v.object({
        primaryId: v.id("memories"),
        duplicateId: v.id("memories"),
        mergedContent: v.string(),
        mergedKeywords: v.array(v.string()),
        mergedSourceMessageIds: v.array(v.id("messages")),
        mergedImportanceScore: v.number(),
        compressedContent: v.optional(v.string()),
        byteSize: v.number(),
      }),
    ),
    maintenanceSummary: v.optional(
      v.object({
        content: v.string(),
        embedding: v.array(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const update of args.compressUpdates) {
      const memory = await ctx.db.get(update.memoryId);
      if (!memory || memory.userId !== args.userId) continue;
      await ctx.db.patch(update.memoryId, {
        compressedContent: update.compressedContent,
        byteSize: update.byteSize,
        updatedAt: now,
      });
    }

    for (const merge of args.duplicateMerges) {
      const primary = await ctx.db.get(merge.primaryId);
      const duplicate = await ctx.db.get(merge.duplicateId);
      if (!primary || !duplicate) continue;
      if (primary.userId !== args.userId || duplicate.userId !== args.userId) continue;

      await ctx.db.patch(merge.primaryId, {
        content: merge.mergedContent,
        normalizedContent: normalizeMemoryContent(merge.mergedContent),
        keywords: merge.mergedKeywords,
        sourceMessageIds: merge.mergedSourceMessageIds,
        importanceScore: merge.mergedImportanceScore,
        compressedContent: merge.compressedContent,
        byteSize: merge.byteSize,
        updatedAt: now,
        lastAccessedAt: now,
      });
      await ctx.db.delete(merge.duplicateId);
    }

    for (const memoryId of args.archiveMemoryIds) {
      const memory = await ctx.db.get(memoryId);
      if (!memory || memory.userId !== args.userId || memory.archived) continue;
      await ctx.db.patch(memoryId, {
        archived: true,
        updatedAt: now,
      });
    }

    for (const memoryId of args.deleteMemoryIds) {
      const memory = await ctx.db.get(memoryId);
      if (!memory || memory.userId !== args.userId) continue;
      if (isProtectedMemory(memory)) continue;
      await ctx.db.delete(memoryId);
    }

    if (args.maintenanceSummary) {
      const summaryContent = args.maintenanceSummary.content.trim();
      if (summaryContent) {
        const compressedContent = compressMemoryContent(summaryContent);
        const byteSize = estimateMemoryByteSize({
          content: summaryContent,
          compressedContent,
          embeddingLength: args.maintenanceSummary.embedding.length,
          metadata: {
            type: "summary",
            source: "maintenance",
          },
        });
        const hasCapacity = await tryFreeSpace(ctx, args.userId, byteSize);
        if (hasCapacity) {
          await ctx.db.insert("memories", {
            userId: args.userId,
            type: "summary",
            content: summaryContent,
            normalizedContent: normalizeMemoryContent(summaryContent),
            compressedContent,
            keywords: tokenizeForKeywordSearch(summaryContent),
            embedding: args.maintenanceSummary.embedding,
            importanceScore: 0.5,
            pinned: false,
            manuallySaved: false,
            archived: false,
            sourceMessageIds: [],
            byteSize,
            createdAt: now,
            updatedAt: now,
            lastAccessedAt: now,
          });
        }
      }
    }

    await recomputeUserMemoryUsage(ctx, args.userId);
  },
});

export const upsertSummaryRecord = internalMutation({
  args: {
    userId: v.id("users"),
    periodType: v.union(
      v.literal("conversation"),
      v.literal("daily"),
      v.literal("weekly"),
    ),
    periodStart: v.number(),
    periodEnd: v.number(),
    summary: v.string(),
    embedding: v.array(v.number()),
    sourceChatId: v.optional(v.id("chats")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("memorySummaries")
      .withIndex("by_user_period", (q) =>
        q
          .eq("userId", args.userId)
          .eq("periodType", args.periodType)
          .eq("periodStart", args.periodStart),
      )
      .unique();

    const byteSize = estimateMemoryByteSize({
      content: args.summary,
      embeddingLength: args.embedding.length,
      metadata: {
        periodType: args.periodType,
        sourceChatId: args.sourceChatId,
      },
    });
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        periodEnd: args.periodEnd,
        summary: args.summary,
        embedding: args.embedding,
        byteSize,
        sourceChatId: args.sourceChatId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("memorySummaries", {
        userId: args.userId,
        periodType: args.periodType,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        summary: args.summary,
        embedding: args.embedding,
        byteSize,
        sourceChatId: args.sourceChatId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.periodType === "conversation" && args.sourceChatId) {
      await ctx.db.patch(args.sourceChatId, {
        summary: args.summary,
        updatedAt: now,
      });
    }

    await recomputeUserMemoryUsage(ctx, args.userId);
  },
});
