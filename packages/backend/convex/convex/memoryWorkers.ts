"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { createGateway, generateText } from "@repo/ai";
import type { Doc, Id } from "./_generated/dataModel";
import {
  clampImportanceScore,
  computeMemoryRetrievalScore,
  estimateMemoryByteSize,
  MEMORY_CONTEXT_RESULT_LIMIT,
  MEMORY_CONTEXT_TOKEN_BUDGET,
  MEMORY_EMBEDDING_DIMENSIONS,
  MEMORY_EMBEDDING_MODEL,
  scoreRecency,
  tokenizeForKeywordSearch,
  type MemoryType,
} from "@repo/core/memory";

type MemoryCandidate = {
  type: MemoryType;
  content: string;
  importanceScore: number;
  keywords: string[];
  sourceMessageIds: Id<"messages">[];
};

type VectorHit<TableName extends "memories" | "memorySummaries"> = {
  _id: Id<TableName>;
  _score: number;
};

type RankedMemory = {
  memory: Doc<"memories">;
  finalScore: number;
  keywordMatched: boolean;
};

type RankedSummary = {
  summary: Doc<"memorySummaries">;
  finalScore: number;
};

const GATEWAY_OPENAI_BASE_URL =
  process.env.AI_GATEWAY_OPENAI_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";

function getGatewayApiKey() {
  const apiKey =
    process.env.VERCEL_AI_GATEWAY_API_KEY ??
    process.env.AI_GATEWAY_API_KEY ??
    process.env.AI_GATEWAY_TOKEN;
  if (!apiKey) {
    throw new Error("AI gateway credentials are not configured.");
  }
  return apiKey;
}

function getGatewayModel(modelId = "google/gemini-2.0-flash-001") {
  const gateway = createGateway({ apiKey: getGatewayApiKey() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return gateway(modelId) as any;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await fetch(`${GATEWAY_OPENAI_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getGatewayApiKey()}`,
    },
    body: JSON.stringify({
      model: MEMORY_EMBEDDING_MODEL,
      input: texts,
      dimensions: MEMORY_EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  return (payload.data ?? []).map((item) => item.embedding ?? []);
}

function parseJsonPayload<T>(text: string, fallback: T): T {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fencedMatch?.[1] ?? text;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatTranscript(messages: Array<Doc<"messages">>) {
  return messages
    .map(
      (message) =>
        `[${message.role.toUpperCase()} ${message._id}]\n${message.content.trim()}`,
    )
    .join("\n\n");
}

async function extractMemoryCandidates(
  messages: Array<Doc<"messages">>,
): Promise<MemoryCandidate[]> {
  const transcript = formatTranscript(messages).slice(0, 12_000);
  if (!transcript.trim()) return [];

  const { text } = await generateText({
    model: getGatewayModel(),
    system: [
      "You extract durable user memory from a chat transcript.",
      "Return JSON only with shape {\"memories\": Memory[]} where Memory has:",
      "type: one of preference, personal_fact, project, long_term, summary, workflow, relationship, context",
      "content: short durable statement in first person preserving user meaning",
      "importanceScore: number between 0 and 1",
      "sourceMessageIds: array of message ids from the transcript",
      "Skip greetings, one-off requests, spam, duplicates, and temporary noise.",
      "Prefer memories that would help future chats.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Extract durable memories from this transcript.\n\n${transcript}`,
      },
    ],
  });

  const parsed = parseJsonPayload<{ memories?: MemoryCandidate[] }>(text, {
    memories: [],
  });

  return (parsed.memories ?? [])
    .map((memory) => ({
      type: memory.type,
      content: memory.content?.trim() ?? "",
      importanceScore: clampImportanceScore(memory.importanceScore),
      keywords: tokenizeForKeywordSearch(memory.content ?? ""),
      sourceMessageIds: Array.isArray(memory.sourceMessageIds)
        ? memory.sourceMessageIds
        : [],
    }))
    .filter(
      (memory) =>
        !!memory.content &&
        memory.sourceMessageIds.length > 0 &&
        memory.content.length >= 8,
    );
}

async function summarizeText(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: getGatewayModel(),
    system:
      "Write concise factual memory summaries that preserve durable context. No preamble.",
    messages: [{ role: "user", content: prompt }],
  });
  return text.trim();
}

function approximateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function isProtectedMemory(memory: Doc<"memories">): boolean {
  return memory.pinned || memory.manuallySaved || memory.type === "preference";
}

function compressContent(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length <= 280) return null;
  return `${trimmed.slice(0, 180).trimEnd()} ... ${trimmed.slice(-80).trimStart()}`;
}

export const processMessageForMemory = internalAction({
  args: {
    chatId: v.id("chats"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    try {
      const extractionContext = await ctx.runQuery(
        internal.memories.getMessageWindowForExtraction,
        {
          chatId: args.chatId,
          messageId: args.messageId,
        },
      );

      if (!extractionContext || extractionContext.messages.length === 0) {
        return null;
      }

      const candidates = await extractMemoryCandidates(extractionContext.messages);
      if (candidates.length > 0) {
        const embeddings = await embedTexts(candidates.map((candidate) => candidate.content));
        await ctx.runMutation(internal.memories.upsertExtractedMemories, {
          userId: extractionContext.user._id,
          chatId: args.chatId,
          entries: candidates.map((candidate, index) => ({
            ...candidate,
            embedding: embeddings[index] ?? [],
          })),
        });
        await ctx.scheduler.runAfter(0, internal.memoryWorkers.runMemoryMaintenance, {
          userId: extractionContext.user._id,
        });
      }

      if (extractionContext.targetMessage.role === "assistant") {
        await ctx.scheduler.runAfter(0, internal.memoryWorkers.refreshSummaries, {
          chatId: args.chatId,
        });
      }

      return { extracted: candidates.length };
    } catch (error) {
      console.error("memory extraction failed", error);
      return null;
    }
  },
});

export const processMessageEmbedding = internalAction({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    try {
      const message = await ctx.runQuery(internal.messages.getMessageByIdInternal, {
        messageId: args.messageId,
      });
      if (!message || !message.content.trim()) return null;
      const [embedding] = await embedTexts([message.content]);
      const tokenCount = approximateTokens(message.content);
      await ctx.runMutation(internal.messages.updateMessageEmbeddingInternal, {
        messageId: args.messageId,
        embedding: embedding ?? [],
        tokenCount,
      });
      return { tokenCount };
    } catch (error) {
      console.error("message embedding failed", error);
      return null;
    }
  },
});

export const refreshSummaries = internalAction({
  args: {
    chatId: v.id("chats"),
  },
  handler: async (ctx, args) => {
    try {
      const conversation = await ctx.runQuery(
        internal.memories.getConversationMessagesForSummary,
        { chatId: args.chatId },
      );
      if (!conversation || conversation.messages.length === 0) return null;

      const latestMessage =
        conversation.messages[conversation.messages.length - 1] ?? null;
      if (!latestMessage) return null;

      const historicalMessages =
        conversation.messages.length > 8
          ? conversation.messages.slice(0, -6)
          : conversation.messages;

      const transcript = formatTranscript(historicalMessages).slice(0, 18_000);
      if (transcript.trim()) {
        const conversationSummary = await summarizeText(
          `Summarize the durable context from this conversation for future retrieval.\n\n${transcript}`,
        );
        if (conversationSummary) {
          const [embedding] = await embedTexts([conversationSummary]);
          await ctx.runMutation(internal.memories.upsertSummaryRecord, {
            userId: conversation.user._id,
            periodType: "conversation",
            periodStart: conversation.chat.createdAt,
            periodEnd: latestMessage.createdAt,
            summary: conversationSummary,
            embedding: embedding ?? [],
            sourceChatId: conversation.chat._id,
          });
        }
      }

      const now = new Date();
      const dayStart = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
      );
      const weekDay = now.getUTCDay();
      const weekStart = dayStart - ((weekDay + 6) % 7) * 86_400_000;
      const summaryInputs = await ctx.runQuery(
        internal.memories.getMemoriesForSummaryPeriods,
        {
          userId: conversation.user._id,
          dayStart,
          weekStart,
        },
      );

      const dailyText = summaryInputs.dayMemories
        .map((memory: Doc<"memories">) => `- (${memory.type}) ${memory.content}`)
        .join("\n")
        .slice(0, 10_000);
      if (dailyText) {
        const dailySummary = await summarizeText(
          `Summarize today's new durable memory for future retrieval.\n\n${dailyText}`,
        );
        if (dailySummary) {
          const [embedding] = await embedTexts([dailySummary]);
          await ctx.runMutation(internal.memories.upsertSummaryRecord, {
            userId: conversation.user._id,
            periodType: "daily",
            periodStart: dayStart,
            periodEnd: Date.now(),
            summary: dailySummary,
            embedding: embedding ?? [],
          });
        }
      }

      const weeklyText = summaryInputs.weekMemories
        .map((memory: Doc<"memories">) => `- (${memory.type}) ${memory.content}`)
        .join("\n")
        .slice(0, 14_000);
      if (weeklyText) {
        const weeklySummary = await summarizeText(
          `Summarize this week's durable user context for future retrieval.\n\n${weeklyText}`,
        );
        if (weeklySummary) {
          const [embedding] = await embedTexts([weeklySummary]);
          await ctx.runMutation(internal.memories.upsertSummaryRecord, {
            userId: conversation.user._id,
            periodType: "weekly",
            periodStart: weekStart,
            periodEnd: Date.now(),
            summary: weeklySummary,
            embedding: embedding ?? [],
          });
        }
      }

      await ctx.scheduler.runAfter(0, internal.memoryWorkers.runMemoryMaintenance, {
        userId: conversation.user._id,
      });
    } catch (error) {
      console.error("memory summary refresh failed", error);
    }

    return null;
  },
});

export const createManualMemory = action({
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
  handler: async (
    ctx,
    args,
  ): Promise<{
    storedCount: number;
    skippedDuplicates: number;
    skippedForQuota: boolean;
    quota: {
      canStore: boolean;
      usedBytes: number;
      limitBytes: number;
      remainingBytes: number;
      usagePercent: number;
      warning: string | null;
    };
  }> => {
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) {
      throw new Error("Not authenticated");
    }

    const content = args.content.trim();
    if (content.length < 8) {
      throw new Error("Memory content is too short.");
    }

    const [embedding] = await embedTexts([content]);
    const result: {
      storedCount: number;
      skippedDuplicates: number;
      skippedForQuota: boolean;
      quota: {
        canStore: boolean;
        usedBytes: number;
        limitBytes: number;
        remainingBytes: number;
        usagePercent: number;
        warning: string | null;
      };
    } = await ctx.runMutation(internal.memories.upsertExtractedMemories, {
      userId: user._id,
      entries: [
        {
          type: args.type,
          content,
          keywords: tokenizeForKeywordSearch(content),
          embedding: embedding ?? [],
          importanceScore: 0.9,
          sourceMessageIds: [],
          pinned: args.pinned ?? false,
          manuallySaved: true,
        },
      ],
    });

    await ctx.scheduler.runAfter(0, internal.memoryWorkers.runMemoryMaintenance, {
      userId: user._id,
    });

    return result;
  },
});

export const runMemoryMaintenance = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    compressed: number;
    archived: number;
    deleted: number;
    deduped: number;
  } | null> => {
    try {
      const snapshot = await ctx.runQuery(internal.memories.getUserMemoriesForMaintenance, {
        userId: args.userId,
      });
      if (!snapshot || snapshot.memories.length === 0) return null;

      const now = Date.now();
      const compressUpdates: Array<{
        memoryId: Id<"memories">;
        compressedContent: string;
        byteSize: number;
      }> = [];
      const archiveMemoryIds: Id<"memories">[] = [];
      const deleteMemoryIds: Id<"memories">[] = [];
      const duplicateMerges: Array<{
        primaryId: Id<"memories">;
        duplicateId: Id<"memories">;
        mergedContent: string;
        mergedKeywords: string[];
        mergedSourceMessageIds: Id<"messages">[];
        mergedImportanceScore: number;
        compressedContent?: string;
        byteSize: number;
      }> = [];

      const seenByKey = new Map<string, Doc<"memories">>();
      for (const memory of snapshot.memories) {
        if (memory.archived) continue;
        const dedupeKey = `${memory.type}:${memory.normalizedContent}`;
        const existing = seenByKey.get(dedupeKey);
        if (!existing) {
          seenByKey.set(dedupeKey, memory);
          continue;
        }

        const primary =
          existing.content.length >= memory.content.length ? existing : memory;
        const duplicate = primary._id === existing._id ? memory : existing;
        const mergedContent = primary.content;
        const mergedKeywords = Array.from(
          new Set([...primary.keywords, ...duplicate.keywords]),
        ).slice(0, 20);
        const mergedSourceMessageIds = Array.from(
          new Set([...primary.sourceMessageIds, ...duplicate.sourceMessageIds]),
        );
        const mergedImportanceScore = Math.max(
          primary.importanceScore,
          duplicate.importanceScore,
        );
        const compressedContent = compressContent(mergedContent) ?? undefined;
        duplicateMerges.push({
          primaryId: primary._id,
          duplicateId: duplicate._id,
          mergedContent,
          mergedKeywords,
          mergedSourceMessageIds,
          mergedImportanceScore,
          compressedContent,
          byteSize: estimateMemoryByteSize({
            content: mergedContent,
            compressedContent,
            embeddingLength: primary.embedding.length,
            metadata: {
              type: primary.type,
              sourceMessageIds: mergedSourceMessageIds,
            },
          }),
        });
      }

      const staleForCompression = snapshot.memories.filter(
        (memory: Doc<"memories">) =>
          !memory.archived &&
          !memory.compressedContent &&
          memory.content.length > 280 &&
          now - memory.lastAccessedAt > 14 * 86_400_000,
      );
      for (const memory of staleForCompression) {
        const compressedContent = compressContent(memory.content);
        if (!compressedContent) continue;
        compressUpdates.push({
          memoryId: memory._id,
          compressedContent,
          byteSize: estimateMemoryByteSize({
            content: memory.content,
            compressedContent,
            embeddingLength: memory.embedding.length,
            metadata: {
              type: memory.type,
              sourceMessageIds: memory.sourceMessageIds,
            },
          }),
        });
      }

      const staleTemporary = snapshot.memories.filter(
        (memory: Doc<"memories">) =>
          !memory.archived &&
          !isProtectedMemory(memory) &&
          memory.type === "context" &&
          memory.importanceScore < 0.25 &&
          now - memory.updatedAt > 14 * 86_400_000,
      );
      deleteMemoryIds.push(
        ...staleTemporary.slice(0, 20).map((memory: Doc<"memories">) => memory._id),
      );

      const inactiveCandidates = snapshot.memories.filter(
        (memory: Doc<"memories">) =>
          !memory.archived &&
          !isProtectedMemory(memory) &&
          memory.importanceScore >= 0.25 &&
          now - memory.lastAccessedAt > 45 * 86_400_000,
      );

      let maintenanceSummary:
        | {
            content: string;
            embedding: number[];
          }
        | undefined;
      if (inactiveCandidates.length >= 4) {
        const maintenanceSource = inactiveCandidates
          .slice(0, 20)
          .map((memory: Doc<"memories">) => `- (${memory.type}) ${memory.content}`)
          .join("\n");
        const summaryContent = await summarizeText(
          `Summarize these inactive memories into one compact long-term memory summary:\n\n${maintenanceSource}`,
        );
        if (summaryContent) {
          const [embedding] = await embedTexts([summaryContent]);
          maintenanceSummary = {
            content: summaryContent,
            embedding: embedding ?? [],
          };
          archiveMemoryIds.push(
            ...inactiveCandidates
              .slice(0, 20)
              .map((memory: Doc<"memories">) => memory._id),
          );
        }
      }

      await ctx.runMutation(internal.memories.applyMaintenanceChanges, {
        userId: args.userId,
        compressUpdates,
        archiveMemoryIds: Array.from(new Set(archiveMemoryIds)),
        deleteMemoryIds: Array.from(new Set(deleteMemoryIds)),
        duplicateMerges,
        maintenanceSummary,
      });

      return {
        compressed: compressUpdates.length,
        archived: archiveMemoryIds.length,
        deleted: deleteMemoryIds.length,
        deduped: duplicateMerges.length,
      };
    } catch (error) {
      console.error("memory maintenance failed", error);
      return null;
    }
  },
});

export const getChatMemoryContext = action({
  args: {
    chatId: v.id("chats"),
    userMessage: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    contextText: string;
    memoryIds: Id<"memories">[];
    summaryIds: Id<"memorySummaries">[];
  } | null> => {
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user) {
      return null;
    }

    const chat = await ctx.runQuery(api.chats.getChat, { chatId: args.chatId });
    if (!chat) {
      return null;
    }

    const recentMessages = await ctx.runQuery(api.messages.getMessages, {
      chatId: args.chatId,
    });
    const recentWindow = recentMessages.slice(-8);
    const [queryEmbedding] = await embedTexts([args.userMessage]);
    const keywords = tokenizeForKeywordSearch(args.userMessage);

    const [vectorMemoriesRaw, vectorSummariesRaw, keywordMemories] = await Promise.all([
      ctx.vectorSearch("memories", "by_embedding", {
        vector: queryEmbedding ?? [],
        limit: 16,
        filter: (q) => q.eq("userId", user._id),
      }),
      ctx.vectorSearch("memorySummaries", "by_embedding", {
        vector: queryEmbedding ?? [],
        limit: 6,
        filter: (q) => q.eq("userId", user._id),
      }),
      ctx.runQuery(internal.memories.searchMemoriesByKeywords, {
        userId: user._id,
        query: keywords.join(" "),
        limit: 10,
      }),
    ]);
    const vectorMemories = vectorMemoriesRaw as VectorHit<"memories">[];
    const vectorSummaries = vectorSummariesRaw as VectorHit<"memorySummaries">[];

    const memoryScoreById = new Map<Id<"memories">, number>(
      vectorMemories.map((result: VectorHit<"memories">) => [result._id, result._score]),
    );
    const summaryScoreById = new Map<Id<"memorySummaries">, number>(
      vectorSummaries.map((result: VectorHit<"memorySummaries">) => [result._id, result._score]),
    );
    const memoryIds: Id<"memories">[] = Array.from(
      new Set<Id<"memories">>([
        ...vectorMemories.map((result: VectorHit<"memories">) => result._id),
        ...keywordMemories.map((memory: Doc<"memories">) => memory._id),
      ]),
    );
    const summaryIds = vectorSummaries.map(
      (result: VectorHit<"memorySummaries">) => result._id,
    );

    const docs: {
      memories: Doc<"memories">[];
      summaries: Doc<"memorySummaries">[];
    } = await ctx.runQuery(internal.memories.getMemoryDocsByIds, {
      memoryIds,
      summaryIds,
    });

    const rankedMemories: RankedMemory[] = docs.memories
      .filter((memory: Doc<"memories">) => memory.userId === user._id && !memory.archived)
      .map((memory: Doc<"memories">) => {
        const vectorSimilarity = memoryScoreById.get(memory._id) ?? 0;
        const importanceScore = clampImportanceScore(memory.importanceScore);
        const recencyScore = scoreRecency(memory.lastAccessedAt || memory.updatedAt);
        const keywordMatched =
          keywords.length > 0 &&
          keywords.some((keyword) =>
            memory.keywords.some((candidate) => candidate.includes(keyword)),
          );
        const finalScore = computeMemoryRetrievalScore({
          vectorSimilarity,
          importanceScore,
          recencyScore,
        });

        return {
          memory,
          finalScore,
          keywordMatched,
        };
      })
      .sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        if (a.keywordMatched !== b.keywordMatched) return a.keywordMatched ? -1 : 1;
        return b.memory.updatedAt - a.memory.updatedAt;
      })
      .slice(0, MEMORY_CONTEXT_RESULT_LIMIT);

    const rankedSummaries: RankedSummary[] = docs.summaries
      .filter((summary: Doc<"memorySummaries">) => summary.userId === user._id)
      .map((summary: Doc<"memorySummaries">) => ({
        summary,
        finalScore:
          (summaryScoreById.get(summary._id) ?? 0) * 0.7 +
          scoreRecency(summary.updatedAt) * 0.3,
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 3);

    await ctx.runMutation(internal.memories.touchMemories, {
      memoryIds: rankedMemories.map((entry: RankedMemory) => entry.memory._id),
    });

    const sections: string[] = [];
    let tokenBudget = MEMORY_CONTEXT_TOKEN_BUDGET;

    if (rankedMemories.length > 0) {
      const lines: string[] = [];
      for (const entry of rankedMemories) {
        const line = `- [${entry.memory.type}] ${
          entry.memory.compressedContent ?? entry.memory.content
        }`;
        const lineTokens = approximateTokens(line);
        if (tokenBudget - lineTokens < 0) break;
        lines.push(line);
        tokenBudget -= lineTokens;
      }
      if (lines.length > 0) {
        sections.push(`Relevant long-term memory:\n${lines.join("\n")}`);
      }
    }

    if (rankedSummaries.length > 0) {
      const lines: string[] = [];
      for (const entry of rankedSummaries) {
        const line = `- [${entry.summary.periodType}] ${entry.summary.summary}`;
        const lineTokens = approximateTokens(line);
        if (tokenBudget - lineTokens < 0) break;
        lines.push(line);
        tokenBudget -= lineTokens;
      }
      if (lines.length > 0) {
        sections.push(`Relevant summaries:\n${lines.join("\n")}`);
      }
    }

    const recentLines: string[] = [];
    for (const message of recentWindow) {
      const line = `- ${message.role}: ${message.content}`;
      const lineTokens = approximateTokens(line);
      if (tokenBudget - lineTokens < 0) break;
      recentLines.push(line);
      tokenBudget -= lineTokens;
    }
    if (recentLines.length > 0) {
      sections.push(`Recent conversation window:\n${recentLines.join("\n")}`);
    }

    return {
      contextText: sections.join("\n\n"),
      memoryIds: rankedMemories.map((entry: RankedMemory) => entry.memory._id),
      summaryIds: rankedSummaries.map((entry: RankedSummary) => entry.summary._id),
    };
  },
});
