import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

// Usage is metered by model cost in ./kodeUsage.ts (authorized + recorded by
// the Kontinue server for every model request), not by saved messages.

// ─────────────────────────────────────────────────────────────────────────────
// Kode IDE chat backend.
//
// The Kode IDE (Tauri desktop app) is a SEPARATE surface from the Kontinue web
// app. Its conversations live in their own `kodeChats` / `kodeMessages` tables so
// coding chats never appear in the web chat list / search, and never feed the
// web app's memory extraction, embeddings, title generation, or import limits.
//
// Folder grouping ("project chats") is kept locally on the desktop app, so there
// is no projectId / source here — just per-user chats and their messages.
// ─────────────────────────────────────────────────────────────────────────────

type SidebarSortableChat = {
	pinnedAt?: number;
	updatedAt: number;
};

/** Pinned chats first (most-recently pinned on top), then by recency. */
function sortChatsForSidebar<T extends SidebarSortableChat>(
	a: T,
	b: T,
): number {
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

/** Resolve the signed-in Convex user, throwing if unauthenticated/unknown. */
async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
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

	return user;
}

/** Load a Kode chat the caller owns, or throw. */
async function requireOwnedChat(
	ctx: MutationCtx,
	chatId: Id<"kodeChats">,
	userId: Id<"users">,
): Promise<Doc<"kodeChats">> {
	const chat = await ctx.db.get(chatId);
	if (!chat) {
		throw new Error("Chat not found");
	}
	if (chat.ownerId !== userId) {
		throw new Error("Unauthorized");
	}
	return chat;
}

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
			.query("kodeChats")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();

		return chats.sort(sortChatsForSidebar);
	},
});

export const createChat = mutation({
	args: {
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const now = Date.now();

		return await ctx.db.insert("kodeChats", {
			ownerId: user._id,
			title: args.title,
			archived: false,
			lastMessageAt: now,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Create a Kode chat from a local coding-session import in one transaction.
 *
 * The desktop app parses + redacts the transcript locally, then sends the
 * normalized turns here so the entire conversation lands atomically (one
 * mutation instead of one write per message). Imported tokens are NOT metered:
 * that usage was already paid for in Claude Code / Codex.
 */
export const importSession = mutation({
	args: {
		title: v.string(),
		provider: v.string(),
		sessionId: v.string(),
		projectPath: v.optional(v.string()),
		lastActivity: v.optional(v.number()),
		model: v.optional(v.string()),
		messages: v.array(
			v.object({
				role: v.union(
					v.literal("user"),
					v.literal("assistant"),
					v.literal("system"),
				),
				content: v.string(),
				timestamp: v.optional(v.number()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const now = Date.now();

		// The desktop importer already bounds this, but the mutation is public —
		// reject pathological payloads rather than writing them.
		if (args.messages.length > 500) {
			throw new Error("This session has too many messages to import.");
		}
		if (args.messages.some((message) => message.content.length > 50_000)) {
			throw new Error("An imported message is too large.");
		}

		const chatId = await ctx.db.insert("kodeChats", {
			ownerId: user._id,
			title: args.title.trim() || "Imported coding session",
			archived: false,
			lastMessageAt: now,
			createdAt: now,
			updatedAt: now,
			importSource: {
				provider: args.provider,
				sessionId: args.sessionId,
				projectPath: args.projectPath,
				lastActivity: args.lastActivity,
				importedAt: now,
				syncedMessageCount: args.messages.length,
				syncedAt: now,
			},
		});

		for (const [index, message] of args.messages.entries()) {
			const timestamp = message.timestamp;
			// Preserve transcript timestamps when they look sane; otherwise fall
			// back to an evenly-spaced synthetic time so the chat reads in order.
			const createdAt =
				typeof timestamp === "number" &&
				timestamp > 0 &&
				timestamp <= now + 86_400_000
					? timestamp
					: now - (args.messages.length - index) * 1_000;

			await ctx.db.insert("kodeMessages", {
				chatId,
				ownerId: user._id,
				role: message.role,
				content: message.content,
				createdAt,
				order: index,
				metadata: args.model ? { model: args.model } : undefined,
			});
		}

		return chatId;
	},
});

/**
 * Append new turns from a previously imported coding session.
 *
 * Sync is append-only: the client sends the normalized turns after the last
 * imported message and the expected persisted count. If the chat has changed
 * (another sync ran, messages were added/removed, or an out-of-band edit
 * happened), the order check fails instead of duplicating or interleaving turns.
 */
export const appendImportedMessages = mutation({
	args: {
		chatId: v.id("kodeChats"),
		expectedMessageCount: v.number(),
		model: v.optional(v.string()),
		messages: v.array(
			v.object({
				role: v.union(
					v.literal("user"),
					v.literal("assistant"),
					v.literal("system"),
				),
				content: v.string(),
				timestamp: v.optional(v.number()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const chat = await requireOwnedChat(ctx, args.chatId, user._id);

		if (!chat.importSource) {
			throw new Error("This chat was not created from an imported session.");
		}
		if (args.messages.length > 500) {
			throw new Error("This session has too many new messages to sync.");
		}
		if (args.messages.some((message) => message.content.length > 50_000)) {
			throw new Error("An imported message is too large.");
		}

		const lastMessage = await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
			.order("desc")
			.first();
		const nextOrder = lastMessage ? lastMessage.order + 1 : 0;

		if (nextOrder !== args.expectedMessageCount) {
			throw new Error(
				"This chat is out of sync with the imported session. Refresh it and try again.",
			);
		}

		const now = Date.now();
		for (const [index, message] of args.messages.entries()) {
			const timestamp = message.timestamp;
			const createdAt =
				typeof timestamp === "number" &&
				timestamp > 0 &&
				timestamp <= now + 86_400_000
					? timestamp
					: now - (args.messages.length - index) * 1_000;

			await ctx.db.insert("kodeMessages", {
				chatId: args.chatId,
				ownerId: user._id,
				role: message.role,
				content: message.content,
				createdAt,
				order: nextOrder + index,
				metadata: args.model ? { model: args.model } : undefined,
			});
		}

		const syncedMessageCount = nextOrder + args.messages.length;
		await ctx.db.patch(args.chatId, {
			lastMessageAt: now,
			updatedAt: now,
			importSource: {
				...chat.importSource,
				syncedMessageCount,
				syncedAt: now,
			},
		});

		return syncedMessageCount;
	},
});

/**
 * Save an imported chat's continuation context so the user's other devices
 * get it. The desktop app calls this after an import or a sync that changed
 * the context. One row per chat.
 */
export const saveImportContext = mutation({
	args: {
		chatId: v.id("kodeChats"),
		contextPrompt: v.string(),
		summary: v.optional(v.string()),
		projectName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const chat = await requireOwnedChat(ctx, args.chatId, user._id);
		if (!chat.importSource) {
			throw new Error("This chat was not created from an imported session.");
		}
		if (args.contextPrompt.length > 120_000 || (args.summary?.length ?? 0) > 20_000) {
			throw new Error("The import context is too large.");
		}
		const existing = await ctx.db
			.query("kodeImportContexts")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
			.unique();
		const fields = {
			contextPrompt: args.contextPrompt,
			summary: args.summary,
			projectName: args.projectName,
			updatedAt: Date.now(),
		};
		if (existing) {
			await ctx.db.patch(existing._id, fields);
		} else {
			await ctx.db.insert("kodeImportContexts", {
				chatId: args.chatId,
				ownerId: user._id,
				...fields,
			});
		}
		return null;
	},
});

/** The saved continuation context of an imported chat, or null. */
export const getImportContext = query({
	args: { chatId: v.id("kodeChats") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user) return null;
		const row = await ctx.db
			.query("kodeImportContexts")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
			.unique();
		if (!row || row.ownerId !== user._id) return null;
		return {
			contextPrompt: row.contextPrompt,
			summary: row.summary ?? null,
			projectName: row.projectName ?? null,
			updatedAt: row.updatedAt,
		};
	},
});

export const getMessages = query({
	args: { chatId: v.id("kodeChats") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return [];
		}

		const chat = await ctx.db.get(args.chatId);
		if (!chat) {
			return [];
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!user || chat.ownerId !== user._id) {
			return [];
		}

		return await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
			.collect();
	},
});

export const addMessage = mutation({
	args: {
		chatId: v.id("kodeChats"),
		role: v.union(v.literal("user"), v.literal("assistant")),
		content: v.string(),
		model: v.optional(v.string()),
		// Total tokens the whole agent turn consumed (summed across every model call).
		// Set on the assistant turn; meters the token budget for the message's model.
		tokens: v.optional(v.number()),
		// Docs citations + the agent's plan for this turn (persisted per message).
		sources: v.optional(
			v.array(v.object({ title: v.string(), url: v.string() })),
		),
		todos: v.optional(
			v.array(
				v.object({
					title: v.string(),
					description: v.optional(v.string()),
					status: v.string(),
				}),
			),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);

		// Append to the end of the chat. Unlike the web `messages.addMessage`, this
		// deliberately skips rate-limit buckets, memory extraction, embeddings, and
		// title generation — the IDE is its own surface and never touches those.
		const lastMessage = await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
			.order("desc")
			.first();

		const order = lastMessage ? lastMessage.order + 1 : 0;
		const now = Date.now();

		const messageId = await ctx.db.insert("kodeMessages", {
			chatId: args.chatId,
			ownerId: user._id,
			role: args.role,
			content: args.content,
			createdAt: now,
			order,
			metadata: {
				model: args.model,
				sources: args.sources,
				todos: args.todos,
			},
		});

		await ctx.db.patch(args.chatId, {
			lastMessageAt: now,
			updatedAt: now,
		});

		// `tokens` is accepted for older desktop builds but no longer metered
		// here; the server records real model cost per request (kodeUsage.ts).

		return messageId;
	},
});

/** Most messages one page of a chat's history can hold. */
const MAX_RECENT_MESSAGES = 500;

/**
 * The newest `limit` messages of a chat (oldest first) and whether there are
 * older ones. The chat view loads history a page at a time instead of every
 * message at once; the full history (getMessages) is only read when a turn
 * needs it for the model.
 */
export const getRecentMessages = query({
	args: { chatId: v.id("kodeChats"), limit: v.number() },
	handler: async (ctx, args) => {
		const empty = { messages: [], hasMore: false };
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return empty;

		const chat = await ctx.db.get(args.chatId);
		if (!chat) return empty;

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user || chat.ownerId !== user._id) return empty;

		const limit = Math.max(1, Math.min(Math.floor(args.limit), MAX_RECENT_MESSAGES));
		const newestFirst = await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
			.order("desc")
			.take(limit + 1);
		return {
			messages: newestFirst.slice(0, limit).reverse(),
			hasMore: newestFirst.length > limit,
		};
	},
});

/**
 * Delete every message in a chat created at or after the given message. Used by
 * the IDE "rewind / redo turn" flow (inclusive = drop the message too).
 */
export const deleteMessagesAfter = mutation({
	args: {
		messageId: v.id("kodeMessages"),
		inclusive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);

		const target = await ctx.db.get(args.messageId);
		if (!target) {
			throw new Error("Message not found");
		}

		await requireOwnedChat(ctx, target.chatId, user._id);

		// Order is the stable per-chat sequence. Using `_creationTime` here would
		// be wrong for imported chats, whose turns are all inserted in one
		// transaction and therefore share a creation timestamp.
		const inclusive = args.inclusive ?? false;
		const allMessages = await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", target.chatId))
			.collect();

		const laterMessages = allMessages.filter((message) =>
			inclusive ? message.order >= target.order : message.order > target.order,
		);

		await Promise.all(laterMessages.map((m) => ctx.db.delete(m._id)));
	},
});

export const toggleChatPin = mutation({
	args: {
		chatId: v.id("kodeChats"),
		pinned: v.boolean(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);

		await ctx.db.patch(args.chatId, {
			pinnedAt: args.pinned ? Date.now() : 0,
		});

		return { pinned: args.pinned };
	},
});

export const setChatArchived = mutation({
	args: {
		chatId: v.id("kodeChats"),
		archived: v.boolean(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);

		await ctx.db.patch(args.chatId, {
			archived: args.archived,
			updatedAt: Date.now(),
		});

		return { archived: args.archived };
	},
});

export const updateChatTitle = mutation({
	args: {
		chatId: v.id("kodeChats"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);

		await ctx.db.patch(args.chatId, {
			title: args.title,
			updatedAt: Date.now(),
		});
	},
});

export const deleteChat = mutation({
	args: { chatId: v.id("kodeChats") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);

		const messages = await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		const importContext = await ctx.db
			.query("kodeImportContexts")
			.withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
			.unique();
		if (importContext) {
			await ctx.db.delete(importContext._id);
		}

		await ctx.db.delete(args.chatId);
	},
});

/**
 * One-time, opt-in cleanup. Earlier builds of the Kode IDE wrote into the shared
 * web `chats` / `messages` tables (tagged `source.provider === "kode"`), so those
 * coding chats leaked into the web app. This moves the signed-in user's legacy
 * Kode chats into the dedicated `kodeChats` / `kodeMessages` tables and removes
 * them from the web tables.
 *
 * Safe to run more than once: after the move there are no `provider:"kode"` rows
 * left, so a second run migrates nothing. Run it from the Convex dashboard or via
 * `npx convex run kode:migrateLegacyKodeChats` while authenticated as the user.
 */
export const migrateLegacyKodeChats = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await requireUser(ctx);

		const legacyChats = await ctx.db
			.query("chats")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();

		let migratedChats = 0;
		let migratedMessages = 0;

		for (const chat of legacyChats) {
			if (chat.source?.provider !== "kode") continue;

			const newChatId = await ctx.db.insert("kodeChats", {
				ownerId: user._id,
				title: chat.title,
				archived: chat.archived ?? false,
				lastMessageAt: chat.lastMessageAt ?? chat.updatedAt,
				pinnedAt: chat.pinnedAt,
				createdAt: chat.createdAt,
				updatedAt: chat.updatedAt,
			});

			const oldMessages = await ctx.db
				.query("messages")
				.withIndex("by_chat_order", (q) => q.eq("chatId", chat._id))
				.collect();

			for (const message of oldMessages) {
				await ctx.db.insert("kodeMessages", {
					chatId: newChatId,
					ownerId: user._id,
					role: message.role,
					content: message.content,
					createdAt: message.createdAt,
					order: message.order,
					metadata: message.metadata
						? {
								model: message.metadata.model,
								sources: message.metadata.sources,
								todos: message.metadata.todos,
							}
						: undefined,
				});
				await ctx.db.delete(message._id);
				migratedMessages += 1;
			}

			await ctx.db.delete(chat._id);
			migratedChats += 1;
		}

		return { migratedChats, migratedMessages };
	},
});
