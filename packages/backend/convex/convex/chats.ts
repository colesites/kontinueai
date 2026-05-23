import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getPersistedPlanTier } from "../lib/plan";
import {
  FREE_MONTHLY_AUTOMATIC_IMPORT_LIMIT,
  STARTER_MONTHLY_AUTOMATIC_IMPORT_LIMIT,
  getMonthlyAutomaticImportLimit,
  getUtcMonthRange,
} from "../lib/import_limits";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const IMPORT_MESSAGE_MAX_CHARS = 300_000;

type StoredChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type SidebarSortableChat = {
  pinnedAt?: number;
  updatedAt: number;
};

function sortChatsForSidebar<T extends SidebarSortableChat>(a: T, b: T): number {
  const aPinnedAt =
    typeof a.pinnedAt === "number" && a.pinnedAt > 0 ? a.pinnedAt : null;
  const bPinnedAt =
    typeof b.pinnedAt === "number" && b.pinnedAt > 0 ? b.pinnedAt : null;

  if (aPinnedAt !== null || bPinnedAt !== null) {
    if (aPinnedAt === null) return 1;
    if (bPinnedAt === null) return -1;
    if (aPinnedAt !== bPinnedAt) return bPinnedAt - aPinnedAt;
  }

  return b.updatedAt - a.updatedAt;
}

function splitMessageContentForStorage(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.length <= IMPORT_MESSAGE_MAX_CHARS) return [trimmed];

  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = trimmed.split(/\n{2,}/);

  const pushChunk = () => {
    const chunk = currentChunk.trim();
    if (chunk) {
      chunks.push(chunk);
    }
    currentChunk = "";
  };

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    const candidate = currentChunk
      ? `${currentChunk}\n\n${trimmedParagraph}`
      : trimmedParagraph;

    if (candidate.length <= IMPORT_MESSAGE_MAX_CHARS) {
      currentChunk = candidate;
      continue;
    }

    pushChunk();

    if (trimmedParagraph.length <= IMPORT_MESSAGE_MAX_CHARS) {
      currentChunk = trimmedParagraph;
      continue;
    }

    for (let i = 0; i < trimmedParagraph.length; i += IMPORT_MESSAGE_MAX_CHARS) {
      const slice = trimmedParagraph
        .slice(i, i + IMPORT_MESSAGE_MAX_CHARS)
        .trim();
      if (slice) {
        chunks.push(slice);
      }
    }
  }

  pushChunk();

  return chunks.length > 0 ? chunks : [trimmed];
}

function expandMessagesForStorage(messages: StoredChatMessage[]): StoredChatMessage[] {
  return messages.flatMap((message) => {
    const chunks = splitMessageContentForStorage(message.content);
    if (chunks.length <= 1) return [{ role: message.role, content: message.content.trim() }];
    return chunks.map((chunk) => ({ role: message.role, content: chunk }));
  });
}

export const createChat = mutation({
  args: {
    title: v.string(),
    provider: v.string(),
    sourceUrl: v.optional(v.string()),
    importMethod: v.union(v.literal("automatic"), v.literal("manual")),
    messages: v.array(
      v.object({
        role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    // Feature gating: automatic imports are limited by plan per UTC month.
    if (args.importMethod === "automatic") {
      const planTier = getPersistedPlanTier(user.plan);
      const monthlyLimit = getMonthlyAutomaticImportLimit(planTier);

      if (monthlyLimit !== null) {
        const { monthStartMs, monthEndMs } = getUtcMonthRange(now);
        const chats = await ctx.db
          .query("chats")
          .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
          .collect();

        const importedChatsThisMonthCount = chats.filter(
          (chat) =>
            chat.source.importMethod === "automatic" &&
            chat.source.importedAt >= monthStartMs &&
            chat.source.importedAt < monthEndMs,
        ).length;

        if (importedChatsThisMonthCount >= monthlyLimit) {
          if (planTier === "free") {
            throw new ConvexError({
              code: "FREE_TIER_IMPORT_LIMIT",
              message:
                `Free tier monthly import limit reached (${FREE_MONTHLY_AUTOMATIC_IMPORT_LIMIT}/month). Please try again next month or upgrade to Starter or Pro.`,
            });
          }

          throw new ConvexError({
            code: "STARTER_TIER_IMPORT_LIMIT",
            message:
              `Starter plan monthly import limit reached (${STARTER_MONTHLY_AUTOMATIC_IMPORT_LIMIT}/month). Please try again next month or upgrade to Pro.`,
          });
        }
      }
    }

    const messagesForStorage = expandMessagesForStorage(args.messages);

    const chatId = await ctx.db.insert("chats", {
      ownerId: user._id,
      title: args.title,
      archived: false,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      source: {
        provider: args.provider,
        sourceUrl: args.sourceUrl,
        importedAt: now,
        importMethod: args.importMethod,
      },
    });

    // Insert imported messages in parallel while preserving deterministic order values.
    const insertedMessageIds = await Promise.all(
      messagesForStorage.map((msg, index) =>
        ctx.db.insert("messages", {
          chatId,
          ownerId: user._id,
          role: msg.role,
          content: msg.content,
          tokenCount: Math.ceil(msg.content.length / 4),
          createdAt: now,
          order: index,
          metadata: {
            tokenCount: Math.ceil(msg.content.length / 4),
            isImported: true,
          },
        }),
      ),
    );

    await Promise.all(
      insertedMessageIds.map((messageId) =>
        ctx.scheduler.runAfter(0, internal.memoryWorkers.processMessageEmbedding, {
          messageId,
        }),
      ),
    );

    // Fixed message removed in favor of dynamic client-side generation

    return chatId;
  }
});

export const appendImportedMessagesToChat = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    const existingMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .collect();

    const alreadyImported = existingMessages.some(
      (message) => message.metadata?.isImported,
    );
    if (alreadyImported) {
      return { insertedCount: 0, skipped: true };
    }

    const nextOrderStart =
      existingMessages.length > 0
        ? Math.max(...existingMessages.map((message) => message.order)) + 1
        : 0;
    const now = Date.now();
    const messagesForStorage = expandMessagesForStorage(args.messages);

    const insertedMessageIds = await Promise.all(
      messagesForStorage.map((message, index) =>
        ctx.db.insert("messages", {
          chatId: args.chatId,
          ownerId: user._id,
          role: message.role,
          content: message.content,
          tokenCount: Math.ceil(message.content.length / 4),
          createdAt: now,
          order: nextOrderStart + index,
          metadata: {
            tokenCount: Math.ceil(message.content.length / 4),
            isImported: true,
          },
        }),
      ),
    );

    await Promise.all(
      insertedMessageIds.map((messageId) =>
        ctx.scheduler.runAfter(0, internal.memoryWorkers.processMessageEmbedding, {
          messageId,
        }),
      ),
    );

    const nextTitle = args.title.trim() || chat.title || "Imported Chat";
    await ctx.db.patch(args.chatId, {
      title: nextTitle,
      updatedAt: now,
    });

    return { insertedCount: messagesForStorage.length, skipped: false };
  },
});

export const appendImportFailureMessageToChat = mutation({
  args: {
    chatId: v.id("chats"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    const existingMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .collect();

    const hasFailureMessage = existingMessages.some(
      (message) =>
        message.metadata?.isImported &&
        message.role === "assistant" &&
        message.content.startsWith("Import failed:"),
    );
    if (hasFailureMessage) {
      return { skipped: true };
    }

    const nextOrder =
      existingMessages.length > 0
        ? Math.max(...existingMessages.map((message) => message.order)) + 1
        : 0;
    const now = Date.now();
    const sanitizedError = args.errorMessage.trim() || "Unknown import error";

    await ctx.db.insert("messages", {
      chatId: args.chatId,
      ownerId: user._id,
      role: "assistant",
      content: `Import failed: ${sanitizedError}`,
      tokenCount: Math.ceil(`Import failed: ${sanitizedError}`.length / 4),
      createdAt: now,
      order: nextOrder,
      metadata: {
        tokenCount: Math.ceil(`Import failed: ${sanitizedError}`.length / 4),
        isImported: true,
      },
    });

    if (chat.title.toLowerCase().startsWith("importing")) {
      await ctx.db.patch(args.chatId, {
        title: "Import failed",
        updatedAt: now,
      });
    }

    return { skipped: false };
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      return null;
    }

    return chat;
  },
});

export const getUserChats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    const chats = await ctx.db
      .query("chats")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    return chats.sort(sortChatsForSidebar);
  },
});

export const toggleChatPin = mutation({
  args: {
    chatId: v.id("chats"),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.chatId, {
      pinnedAt: args.pinned ? Date.now() : 0,
    });

    return { pinned: args.pinned };
  },
});

export const updateChatTitle = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user || chat.ownerId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Delete all messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete the chat
    await ctx.db.delete(args.chatId);
  },
});

export const searchChats = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    // 1. Clean and validate query
    const STOP_WORDS = new Set([
      "the",
      "and",
      "a",
      "an",
      "to",
      "for",
      "with",
      "is",
      "in",
      "on",
      "at",
      "by",
      "this",
      "that",
      "it",
      "from",
      "are",
      "was",
      "were",
      "be",
      "has",
      "have",
      "had",
      "can",
      "will",
      "would",
      "should",
      "not",
    ]);

    const searchQuery = args.query.trim().replace(/[.,!?;:]/g, "");
    if (!searchQuery) return [];

    // Extract significant words for post-filtering
    const searchWords = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // If no significant words, use original query as-is
    const finalSearchQuery =
      searchWords.length > 0 ? searchWords.join(" ") : searchQuery;

    // Helper: Count how many search words appear in text
    const countMatchingWords = (text: string, words: string[]): number => {
      const lowerText = text.toLowerCase();
      return words.filter((word) => lowerText.includes(word)).length;
    };

    // Helper: Check if text contains exact phrase (case-insensitive)
    const containsExactPhrase = (text: string, phrase: string): boolean => {
      return text.toLowerCase().includes(phrase.toLowerCase());
    };

    // 2. Parallel Search for Titles and Messages
    const [titleMatches, userMatches, assistantMatches] = await Promise.all([
      ctx.db
        .query("chats")
        .withSearchIndex("search_title", (q) =>
          q.search("title", finalSearchQuery).eq("ownerId", user._id),
        )
        .take(20),
      ctx.db
        .query("messages")
        .withSearchIndex("search_content", (q) =>
          q
            .search("content", finalSearchQuery)
            .eq("ownerId", user._id)
            .eq("role", "user"),
        )
        .take(30),
      ctx.db
        .query("messages")
        .withSearchIndex("search_content", (q) =>
          q
            .search("content", finalSearchQuery)
            .eq("ownerId", user._id)
            .eq("role", "assistant"),
        )
        .take(30),
    ]);

    // 3. Build chat data with content for post-filtering
    const chatData = new Map<
      Id<"chats">,
      { chat: Doc<"chats"> | null; score: number; matchedContent: string[] }
    >();

    // Process title matches - require at least 50% of search words match
    const minRequiredWords = Math.max(1, Math.ceil(searchWords.length * 0.5));

    titleMatches.forEach((chat, index) => {
      if (!chat) return;
      const matchCount = countMatchingWords(chat.title, searchWords);

      // Skip if not enough words match
      if (searchWords.length > 0 && matchCount < minRequiredWords) return;

      // Base score from position + bonus for word matches
      let score = 100 - index * 3;
      score += matchCount * 10; // Bonus per matching word

      // Big bonus for exact phrase match
      if (containsExactPhrase(chat.title, searchQuery)) {
        score += 50;
      }

      chatData.set(chat._id, {
        chat,
        score,
        matchedContent: [chat.title],
      });
    });

    // Process message matches
    const allMessageMatches = [...userMatches, ...assistantMatches];

    for (const msg of allMessageMatches) {
      if (!msg || !msg.chatId) continue;

      const matchCount = countMatchingWords(msg.content, searchWords);

      // Skip if not enough words match
      if (searchWords.length > 0 && matchCount < minRequiredWords) continue;

      // Calculate score
      let score = 50; // Base score for message matches
      score += matchCount * 8; // Bonus per matching word

      // Big bonus for exact phrase match
      if (containsExactPhrase(msg.content, searchQuery)) {
        score += 40;
      }

      const existing = chatData.get(msg.chatId);
      if (existing) {
        // Add to matched content and maybe improve score
        existing.matchedContent.push(msg.content.slice(0, 200));
        if (score > existing.score) {
          existing.score = score;
        }
      } else {
        // Need to fetch the chat
        chatData.set(msg.chatId, {
          chat: null, // Will fetch later
          score,
          matchedContent: [msg.content.slice(0, 200)],
        });
      }
    }

    // 4. Fetch missing chat objects
    const chatIdsToFetch = Array.from(chatData.entries())
      .filter(([, data]) => data.chat === null)
      .map(([id]) => id);

    const fetchedChats = await Promise.all(
      chatIdsToFetch.map((id) => {
        try {
          return ctx.db.get(id);
        } catch {
          return null;
        }
      }),
    );

    // Update chatData with fetched chats
    chatIdsToFetch.forEach((id, index) => {
      const fetched = fetchedChats[index];
      const data = chatData.get(id);
      if (data && fetched) {
        data.chat = fetched;
      } else if (data && !fetched) {
        chatData.delete(id); // Remove if chat not found
      }
    });

    // 5. Final sort and return
    const finalResults = Array.from(chatData.values())
      .filter(
        (data): data is {
          chat: Doc<"chats">;
          score: number;
          matchedContent: string[];
        } => data.chat !== null,
      )
      .sort((a, b) => {
        const pinSort = sortChatsForSidebar(a.chat, b.chat);
        if (pinSort !== 0) return pinSort;
        return b.score - a.score;
      })
      .map((data) => data.chat);

    return finalResults.slice(0, 10);
  },
});

export const backfillMessageOwners = mutation({
  args: {},
  handler: async (ctx) => {
    const chats = await ctx.db.query("chats").collect();
    let count = 0;

    for (const chat of chats) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .collect();

      for (const msg of messages) {
        if (!msg.ownerId) {
          await ctx.db.patch(msg._id, { ownerId: chat.ownerId });
          count++;
        }
      }
    }
    return count;
  },
});

export const getSharedConversation = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    // No authentication required - this is a public query
    const conversation = await ctx.db.get(args.chatId);
    if (!conversation) {
      return null;
    }

    // Fetch associated messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
      .collect();

    return {
      ...conversation,
      messages,
    };
  },
});
