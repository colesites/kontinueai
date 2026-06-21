import { v } from "convex/values";
import { getPersistedPlanTier, type PersistedPlanTier } from "../lib/plan";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

// ─── Usage metering ──────────────────────────────────────────────────────────
// The Kode IDE is AGENTIC: one prompt fans out into many model calls + tool runs,
// so a per-MESSAGE count badly mismatches real cost ("build goliath in 2 prompts").
// We therefore meter by TOKENS — the sum of input+output tokens across every model
// call in a turn — against ONE GENERAL daily + weekly budget per tier (all models
// counted the same), like the general allowance Claude Code / Codex show users.
// Stored in the shared `usage` table (the `requestCount` field holds summed tokens
// for these kode buckets). Budgets are tunable.
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

type KodeUsageLimits = { daily: number; weekly: number };

// General token budgets per tier (input+output, summed across the whole turn).
function getKodeUsageLimits(plan: PersistedPlanTier): KodeUsageLimits {
	switch (plan) {
		case "pro":
			return { daily: 50_000_000, weekly: 250_000_000 };
		case "starter":
			return { daily: 10_000_000, weekly: 50_000_000 };
		default:
			return { daily: 1_000_000, weekly: 5_000_000 };
	}
}

/** First ms of the current UTC day. */
function utcDayStart(now: number): number {
	const d = new Date(now);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** First ms of the current UTC week (weeks start Monday). */
function utcWeekStart(now: number): number {
	const dayStart = utcDayStart(now);
	const dayOfWeek = new Date(dayStart).getUTCDay(); // 0=Sun … 6=Sat
	const daysSinceMonday = (dayOfWeek + 6) % 7;
	return dayStart - daysSinceMonday * DAY_MS;
}

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

/** Add a turn's token cost to the user's general daily + weekly budgets. */
async function recordKodeTokens(
	ctx: MutationCtx,
	userId: Id<"users">,
	tokens: number,
	now: number,
): Promise<void> {
	if (tokens <= 0) return;

	const windows = [
		{ bucketType: "day_kode" as const, bucketStartMs: utcDayStart(now) },
		{ bucketType: "week_kode" as const, bucketStartMs: utcWeekStart(now) },
	];

	for (const { bucketType, bucketStartMs } of windows) {
		const existing = await ctx.db
			.query("usage")
			.withIndex("by_owner_bucket", (q) =>
				q
					.eq("ownerId", userId)
					.eq("bucketType", bucketType)
					.eq("bucketStartMs", bucketStartMs),
			)
			.unique();

		if (existing) {
			// `requestCount` stores summed tokens for these kode buckets.
			await ctx.db.patch(existing._id, {
				requestCount: existing.requestCount + tokens,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("usage", {
				ownerId: userId,
				bucketType,
				bucketStartMs,
				requestCount: tokens,
				updatedAt: now,
			});
		}
	}
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

		// Meter token usage on the assistant turn (the turn that did the work).
		if (args.role === "assistant" && args.tokens && args.tokens > 0) {
			await recordKodeTokens(ctx, user._id, args.tokens, now);
		}

		return messageId;
	},
});

/**
 * General token usage for the signed-in user: daily + weekly used/limit and the
 * next reset for each. Powers the sidebar "Usage remaining" menu. (`requestCount`
 * stores summed tokens for these kode buckets.)
 */
export const getUsage = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!user) return null;

		const now = Date.now();
		const dayStart = utcDayStart(now);
		const weekStart = utcWeekStart(now);
		const plan = getPersistedPlanTier(user.plan);
		const limits = getKodeUsageLimits(plan);

		const bucketUsed = async (
			bucketType: "day_kode" | "week_kode",
			bucketStartMs: number,
		): Promise<number> => {
			const row = await ctx.db
				.query("usage")
				.withIndex("by_owner_bucket", (q) =>
					q
						.eq("ownerId", user._id)
						.eq("bucketType", bucketType)
						.eq("bucketStartMs", bucketStartMs),
				)
				.unique();
			return row?.requestCount ?? 0;
		};

		const [dayUsed, weekUsed] = await Promise.all([
			bucketUsed("day_kode", dayStart),
			bucketUsed("week_kode", weekStart),
		]);

		return {
			plan,
			// Unit of `used`/`limit` is TOKENS.
			daily: { used: dayUsed, limit: limits.daily, resetAt: dayStart + DAY_MS },
			weekly: {
				used: weekUsed,
				limit: limits.weekly,
				resetAt: weekStart + WEEK_MS,
			},
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

		const cutoff = target._creationTime;
		const inclusive = args.inclusive ?? false;

		const laterMessages = await ctx.db
			.query("kodeMessages")
			.withIndex("by_chat", (q) => q.eq("chatId", target.chatId))
			.filter((q) =>
				inclusive
					? q.gte(q.field("_creationTime"), cutoff)
					: q.gt(q.field("_creationTime"), cutoff),
			)
			.collect();

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
