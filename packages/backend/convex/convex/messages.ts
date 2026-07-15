import { ConvexError, v } from "convex/values";
import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { getChatRequestCreditCost } from "@repo/core/ai-usage-credits";
import type { Doc } from "./_generated/dataModel";
import {
	type MutationCtx,
	mutation,
	query,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { getPersistedPlanTier } from "../lib/plan";
import {
	getMonthlyAutomaticImportLimit,
	getUtcMonthRange,
} from "../lib/import_limits";
import { isKaiModel, getKaiMonthlyLimit } from "../lib/kai";
import { internal } from "./_generated/api";
import { consumeAiUsageCredits } from "./lib/aiUsageCredits";

type ExternalModelClass = "basic" | "pro" | "frontier";
type MonthlyBucket =
	| "month_kai"
	| "month_standard"
	| "month_premium"
	| "month_frontier";

function resolveExternalModelClass(
	modelClass: ExternalModelClass | undefined,
	isPremiumModel: boolean | undefined,
): ExternalModelClass {
	return modelClass ?? (isPremiumModel ? "pro" : "basic");
}

function bucketForModelClass(modelClass: ExternalModelClass): MonthlyBucket {
	if (modelClass === "frontier") return "month_frontier";
	if (modelClass === "pro") return "month_premium";
	return "month_standard";
}

async function consumeMessageUsage(
	ctx: MutationCtx,
	user: Doc<"users">,
	model: string | undefined,
	modelClass: ExternalModelClass | undefined,
	isPremiumModel: boolean | undefined,
): Promise<void> {
	const planTier = getPersistedPlanTier(user.plan);
	const plan = PLAN_DEFINITIONS[planTier];
	const rpmLimit = planTier === "free" ? 5 : 10;
	const nowMs = Date.now();
	const minuteBucketStartMs = Math.floor(nowMs / 60_000) * 60_000;
	const date = new Date(nowMs);
	const monthBucketStartMs = Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		1,
	);

	let bucketType: MonthlyBucket;
	let limit: number;
	let limitCode: string;
	let limitMessage: string;
	let aiCreditCost = 0;

	if (isKaiModel(model)) {
		bucketType = "month_kai";
		limit = getKaiMonthlyLimit(planTier);
		limitCode = "RATE_LIMIT_KAI";
		limitMessage = `Monthly K-AI 1.0 limit reached (${limit} requests/month on the ${planTier} plan). Upgrade for a higher limit or try again next month.`;
	} else {
		const externalClass = resolveExternalModelClass(modelClass, isPremiumModel);
		bucketType = bucketForModelClass(externalClass);
		limit = plan.monthlyRequests[externalClass];
		limitCode = `RATE_LIMIT_${externalClass.toUpperCase()}`;
		limitMessage =
			limit === 0
				? `${plan.name} does not include ${externalClass}-model access.`
				: `Monthly ${externalClass}-model limit reached (${limit} requests/month on ${plan.name}). Try another included model or wait for the monthly reset.`;
		aiCreditCost = getChatRequestCreditCost(externalClass);
	}

	const [minuteUsage, monthlyUsage] = await Promise.all([
		ctx.db
			.query("usage")
			.withIndex("by_owner_bucket", (q) =>
				q
					.eq("ownerId", user._id)
					.eq("bucketType", "minute")
					.eq("bucketStartMs", minuteBucketStartMs),
			)
			.unique(),
		ctx.db
			.query("usage")
			.withIndex("by_owner_bucket", (q) =>
				q
					.eq("ownerId", user._id)
					.eq("bucketType", bucketType)
					.eq("bucketStartMs", monthBucketStartMs),
			)
			.unique(),
	]);

	const minuteCount = minuteUsage?.requestCount ?? 0;
	const monthlyCount = monthlyUsage?.requestCount ?? 0;
	if (minuteCount >= rpmLimit) {
		throw new ConvexError({
			code: "RATE_LIMIT_RPM",
			message: `Rate limit reached (${rpmLimit} requests/min). Please wait and try again.`,
		});
	}
	if (limit <= 0 || monthlyCount >= limit) {
		throw new ConvexError({ code: limitCode, message: limitMessage });
	}
	if (aiCreditCost > 0) {
		await consumeAiUsageCredits(ctx, user, aiCreditCost);
	}

	if (minuteUsage) {
		await ctx.db.patch(minuteUsage._id, {
			requestCount: minuteCount + 1,
			updatedAt: nowMs,
		});
	} else {
		await ctx.db.insert("usage", {
			ownerId: user._id,
			bucketType: "minute",
			bucketStartMs: minuteBucketStartMs,
			requestCount: 1,
			updatedAt: nowMs,
		});
	}

	if (monthlyUsage) {
		await ctx.db.patch(monthlyUsage._id, {
			requestCount: monthlyCount + 1,
			updatedAt: nowMs,
		});
	} else {
		await ctx.db.insert("usage", {
			ownerId: user._id,
			bucketType,
			bucketStartMs: monthBucketStartMs,
			requestCount: 1,
			updatedAt: nowMs,
		});
	}
}

export const getMessages = query({
	args: { chatId: v.id("chats") },
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
			.query("messages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
			.collect();
	},
});

export const getMessageByIdInternal = internalQuery({
	args: {
		messageId: v.id("messages"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.messageId);
	},
});

export const addMessage = mutation({
	args: {
		chatId: v.id("chats"),
		role: v.union(v.literal("user"), v.literal("assistant")),
		content: v.string(),
		model: v.optional(v.string()),
		isPremiumModel: v.optional(v.boolean()),
		modelClass: v.optional(
			v.union(v.literal("basic"), v.literal("pro"), v.literal("frontier")),
		),
		// Kode IDE: docs citations + the agent's plan for this turn.
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
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const chat = await ctx.db.get(args.chatId);
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!chat || !user || chat.ownerId !== user._id) {
			throw new Error("Chat not found");
		}

		// Usage is consumed by the authenticated chat API immediately before it
		// starts provider work. Keeping persistence separate prevents direct API
		// requests from bypassing plan limits and avoids double charging clients.

		// Get the highest order number
		const lastMessage = await ctx.db
			.query("messages")
			.withIndex("by_chat_order", (q) => q.eq("chatId", args.chatId))
			.order("desc")
			.first();

		const order = lastMessage ? lastMessage.order + 1 : 0;
		const now = Date.now();

		if (
			args.role === "user" &&
			order === 0 &&
			chat.title === "New Conversation"
		) {
			// Schedule title generation as a background action
			await ctx.scheduler.runAfter(
				0,
				internal.titleGenerator.generateAndUpdateTitle,
				{
					chatId: args.chatId,
					firstMessage: args.content,
				},
			);
		}

		const messageId = await ctx.db.insert("messages", {
			chatId: args.chatId,
			ownerId: user._id,
			role: args.role,
			content: args.content,
			tokenCount: Math.ceil(args.content.length / 4),
			createdAt: now,
			order,
			metadata: {
				model: args.model,
				tokenCount: Math.ceil(args.content.length / 4),
				isImported: false,
				sources: args.sources,
				todos: args.todos,
			},
		});

		// Update chat's updatedAt
		await ctx.db.patch(args.chatId, {
			lastMessageAt: now,
			updatedAt: now,
		});

		await ctx.scheduler.runAfter(
			0,
			internal.memoryWorkers.processMessageForMemory,
			{
				chatId: args.chatId,
				messageId,
			},
		);
		await ctx.scheduler.runAfter(
			0,
			internal.memoryWorkers.processMessageEmbedding,
			{
				messageId,
			},
		);

		return messageId;
	},
});

export const updateMessageContent = mutation({
	args: {
		messageId: v.id("messages"),
		content: v.string(),
		model: v.optional(v.string()),
		isPremiumModel: v.optional(v.boolean()),
		modelClass: v.optional(
			v.union(v.literal("basic"), v.literal("pro"), v.literal("frontier")),
		),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const message = await ctx.db.get(args.messageId);
		const chat = message ? await ctx.db.get(message.chatId) : null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!message || !chat || !user || chat.ownerId !== user._id) {
			throw new Error("Message not found");
		}

		await ctx.db.patch(args.messageId, {
			content: args.content,
			tokenCount: Math.ceil(args.content.length / 4),
			metadata: {
				...message.metadata,
				tokenCount: Math.ceil(args.content.length / 4),
			},
		});

		await ctx.scheduler.runAfter(
			0,
			internal.memoryWorkers.processMessageForMemory,
			{
				chatId: message.chatId,
				messageId: args.messageId,
			},
		);
		await ctx.scheduler.runAfter(
			0,
			internal.memoryWorkers.processMessageEmbedding,
			{
				messageId: args.messageId,
			},
		);
	},
});

export const consumeChatRequest = mutation({
	args: {
		model: v.string(),
		modelClass: v.optional(
			v.union(v.literal("basic"), v.literal("pro"), v.literal("frontier")),
		),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Unauthenticated");
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user) throw new Error("User not found");

		await consumeMessageUsage(
			ctx,
			user,
			args.model,
			args.modelClass,
			undefined,
		);
		return null;
	},
});

/**
 * Delete every message in a chat that was created at or after the given message.
 * Used by the "edit user message" flow: when a user edits a turn, the assistant's
 * reply (and any subsequent turns) become stale and must be removed before
 * regeneration.
 */
export const deleteMessagesAfter = mutation({
	args: {
		messageId: v.id("messages"),
		/** If true, the message at messageId is preserved (only later ones are deleted). */
		inclusive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const target = await ctx.db.get(args.messageId);
		const chat = target ? await ctx.db.get(target.chatId) : null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!target || !chat || !user || chat.ownerId !== user._id) {
			throw new Error("Message not found");
		}

		const cutoff = target._creationTime;
		const inclusive = args.inclusive ?? false;

		const laterMessages = await ctx.db
			.query("messages")
			.withIndex("by_chat", (q) => q.eq("chatId", target.chatId))
			.filter((q) =>
				inclusive
					? q.gte(q.field("_creationTime"), cutoff)
					: q.gt(q.field("_creationTime"), cutoff),
			)
			.collect();

		await Promise.all(laterMessages.map((m) => ctx.db.delete(m._id)));

		await ctx.scheduler.runAfter(0, internal.memoryWorkers.refreshSummaries, {
			chatId: target.chatId,
		});
	},
});

// Internal mutation to update chat title (bypasses auth checks)
export const updateChatTitleInternal = internalMutation({
	args: {
		chatId: v.id("chats"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.chatId, {
			title: args.title,
			updatedAt: Date.now(),
		});
	},
});

export const updateMessageEmbeddingInternal = internalMutation({
	args: {
		messageId: v.id("messages"),
		embedding: v.array(v.number()),
		tokenCount: v.number(),
	},
	handler: async (ctx, args) => {
		const message = await ctx.db.get(args.messageId);
		if (!message) return;
		await ctx.db.patch(args.messageId, {
			embedding: args.embedding,
			tokenCount: args.tokenCount,
			metadata: {
				...message.metadata,
				tokenCount: args.tokenCount,
			},
		});
	},
});

/** Returns usage for the logged-in user:
 *  - monthly message usage
 *  - monthly automatic import usage
 *  Used by the Settings page usage tracker. */
export const getMonthlyUsage = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();

		if (!user) return null;

		const nowMs = Date.now();
		const { monthStartMs, monthEndMs } = getUtcMonthRange(nowMs);
		const monthBucketStartMs = monthStartMs;
		const planTier = getPersistedPlanTier(user.plan);

		const [proPremium, proStandard, frontierMonthly, kaiMonthly, chats] =
			await Promise.all([
				ctx.db
					.query("usage")
					.withIndex("by_owner_bucket", (q) =>
						q
							.eq("ownerId", user._id)
							.eq("bucketType", "month_premium")
							.eq("bucketStartMs", monthBucketStartMs),
					)
					.unique(),
				ctx.db
					.query("usage")
					.withIndex("by_owner_bucket", (q) =>
						q
							.eq("ownerId", user._id)
							.eq("bucketType", "month_standard")
							.eq("bucketStartMs", monthBucketStartMs),
					)
					.unique(),
				ctx.db
					.query("usage")
					.withIndex("by_owner_bucket", (q) =>
						q
							.eq("ownerId", user._id)
							.eq("bucketType", "month_frontier")
							.eq("bucketStartMs", monthBucketStartMs),
					)
					.unique(),
				ctx.db
					.query("usage")
					.withIndex("by_owner_bucket", (q) =>
						q
							.eq("ownerId", user._id)
							.eq("bucketType", "month_kai")
							.eq("bucketStartMs", monthBucketStartMs),
					)
					.unique(),
				ctx.db
					.query("chats")
					.withIndex("by_owner_and_imported_at", (q) =>
						q
							.eq("ownerId", user._id)
							.gte("source.importedAt", monthStartMs)
							.lt("source.importedAt", monthEndMs),
					)
					.collect(),
			]);

		const isPaid = planTier !== "free";
		const plan = PLAN_DEFINITIONS[planTier];
		const paidPremiumUsed = proPremium?.requestCount ?? 0;
		const paidStandardUsed = proStandard?.requestCount ?? 0;
		const frontierUsed = frontierMonthly?.requestCount ?? 0;
		const paidTotalUsed = paidPremiumUsed + paidStandardUsed + frontierUsed;
		const paidPremiumLimit = plan.monthlyRequests.pro;
		const paidStandardLimit = plan.monthlyRequests.basic;
		const frontierLimit = plan.monthlyRequests.frontier;
		const paidTotalLimit = paidPremiumLimit + paidStandardLimit + frontierLimit;
		const monthlyImportUsed = chats.filter(
			(chat) =>
				chat.source.importMethod === "automatic" &&
				chat.source.importedAt >= monthStartMs &&
				chat.source.importedAt < monthEndMs,
		).length;
		const monthlyImportLimit = getMonthlyAutomaticImportLimit(planTier);

		// K-AI 1.0 has its own monthly request ceiling on every plan.
		const kaiUsed = kaiMonthly?.requestCount ?? 0;
		const kaiLimit = getKaiMonthlyLimit(planTier);

		return {
			planTier,
			isPaid,
			// K-AI 1.0
			kaiUsed,
			kaiLimit,
			// Legacy fields retained for older settings clients.
			freeMonthlyUsed: 0,
			freeMonthlyLimit: 0,
			// External model groups
			paidPremiumUsed,
			paidPremiumLimit,
			paidStandardUsed,
			paidStandardLimit,
			frontierUsed,
			frontierLimit,
			paidTotalUsed,
			paidTotalLimit,
			monthlyImportUsed,
			monthlyImportLimit,
		};
	},
});
