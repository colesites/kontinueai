import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import {
	getRealtimeVoiceModel,
	getUtcMonthKey,
	REALTIME_VOICE_LIMITS,
} from "@repo/core/realtime-voice";
import { ConvexError, v } from "convex/values";
import { getPersistedPlanTier } from "../lib/plan";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
	consumeAiUsageCredits,
	readAiUsageCredits,
} from "./lib/aiUsageCredits";

const HEARTBEAT_GRACE_SECONDS = 20;

async function userByClerkSubject(
	ctx: QueryCtx | MutationCtx,
	clerkSubject: string,
): Promise<Doc<"users"> | null> {
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkSubject))
		.unique();
}

async function authenticatedUser(
	ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity)
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "Sign in to use live voice.",
		});

	// Existing accounts are keyed by Clerk's subject. Identity is still derived
	// server-side; no caller-provided user id participates in authorization.
	const user = await userByClerkSubject(ctx, identity.subject);
	if (!user)
		throw new ConvexError({
			code: "USER_NOT_FOUND",
			message: "Your account is still syncing. Try again shortly.",
		});
	return user;
}

async function usageForMonth(
	ctx: QueryCtx | MutationCtx,
	ownerId: Doc<"users">["_id"],
	monthKey: string,
) {
	return await ctx.db
		.query("realtimeVoiceUsage")
		.withIndex("by_owner_and_month", (q) =>
			q.eq("ownerId", ownerId).eq("monthKey", monthKey),
		)
		.unique();
}

export const getAllowance = query({
	args: {},
	handler: async (ctx) => {
		// This query is mounted from UI and can briefly run while Clerk is
		// refreshing its Convex token or while a new account is being synced.
		// Reads return a loading state; mutations remain strictly authenticated.
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		const user = await userByClerkSubject(ctx, identity.subject);
		if (!user) return null;
		const tier = getPersistedPlanTier(user.plan);
		const limits = REALTIME_VOICE_LIMITS[tier];
		const monthKey = getUtcMonthKey();
		const usage = await usageForMonth(ctx, user._id, monthKey);
		const usedSeconds = usage?.usedSeconds ?? 0;
		return {
			tier,
			model: getRealtimeVoiceModel(tier),
			usedSeconds,
			monthlySeconds: limits.monthlySeconds,
			remainingSeconds: Math.max(0, limits.monthlySeconds - usedSeconds),
			maxSessionSeconds: limits.maxSessionSeconds,
		};
	},
});

export const startSession = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await authenticatedUser(ctx);
		const tier = getPersistedPlanTier(user.plan);
		if (tier !== "pro" && tier !== "max") {
			throw new ConvexError({
				code: "PLAN_REQUIRED",
				message: "Kontinue Live is available on Pro and Max.",
			});
		}

		const now = Date.now();
		const monthKey = getUtcMonthKey(now);
		const limits = REALTIME_VOICE_LIMITS[tier];
		const usage = await usageForMonth(ctx, user._id, monthKey);
		const usedSeconds = usage?.usedSeconds ?? 0;
		if (usedSeconds >= limits.monthlySeconds) {
			throw new ConvexError({
				code: "VOICE_LIMIT_REACHED",
				message: "Your live voice allowance resets at the start of next month.",
			});
		}

		const recent = await ctx.db
			.query("realtimeVoiceSessions")
			.withIndex("by_owner_and_started", (q) => q.eq("ownerId", user._id))
			.order("desc")
			.take(5);
		const active = recent.find(
			(session) =>
				session.endedAt === undefined &&
				now - session.startedAt < limits.maxSessionSeconds * 1000,
		);
		if (active) {
			throw new ConvexError({
				code: "VOICE_SESSION_ACTIVE",
				message: "A live voice session is already active for this account.",
			});
		}

		const model = getRealtimeVoiceModel(tier);
		if (!model)
			throw new ConvexError({
				code: "MODEL_UNAVAILABLE",
				message: "No live voice model is available for this plan.",
			});

		const sessionId = await ctx.db.insert("realtimeVoiceSessions", {
			ownerId: user._id,
			model,
			planTier: tier,
			monthKey,
			startedAt: now,
			lastMeteredAt: now,
			usedSeconds: 0,
		});

		return {
			sessionId,
			model,
			remainingSeconds: limits.monthlySeconds - usedSeconds,
			maxSessionSeconds: limits.maxSessionSeconds,
		};
	},
});

export const getSessionSetup = query({
	args: { sessionId: v.id("realtimeVoiceSessions") },
	handler: async (ctx, args) => {
		const user = await authenticatedUser(ctx);
		const session = await ctx.db.get(args.sessionId);
		if (
			!session ||
			session.ownerId !== user._id ||
			session.endedAt !== undefined
		)
			return null;

		const tier = getPersistedPlanTier(user.plan);
		if (
			tier !== session.planTier ||
			getRealtimeVoiceModel(tier) !== session.model
		)
			return null;

		return { model: session.model };
	},
});

export const meterSession = mutation({
	args: { sessionId: v.id("realtimeVoiceSessions") },
	handler: async (ctx, args) => {
		const user = await authenticatedUser(ctx);
		const session = await ctx.db.get(args.sessionId);
		if (
			!session ||
			session.ownerId !== user._id ||
			session.endedAt !== undefined
		) {
			throw new ConvexError({
				code: "SESSION_ENDED",
				message: "This live voice session has ended.",
			});
		}

		const now = Date.now();
		const limits = REALTIME_VOICE_LIMITS[session.planTier];
		const sessionElapsed = Math.floor((now - session.startedAt) / 1000);
		const delta = Math.max(
			0,
			Math.min(
				HEARTBEAT_GRACE_SECONDS,
				Math.floor((now - session.lastMeteredAt) / 1000),
			),
		);
		const usage = await usageForMonth(ctx, user._id, session.monthKey);
		const usedSeconds = usage?.usedSeconds ?? 0;
		const remainingBefore = Math.max(0, limits.monthlySeconds - usedSeconds);
		const aiCredits = await readAiUsageCredits(ctx, user);
		const affordableSeconds = Math.floor(
			aiCredits.remaining / AI_USAGE_CREDIT_COSTS.liveVoicePerSecond,
		);
		const consumed = Math.min(delta, remainingBefore, affordableSeconds);
		const nextUsed = usedSeconds + consumed;
		const shouldEnd =
			sessionElapsed >= limits.maxSessionSeconds ||
			nextUsed >= limits.monthlySeconds ||
			affordableSeconds <= delta;
		if (consumed > 0) {
			await consumeAiUsageCredits(
				ctx,
				user,
				consumed * AI_USAGE_CREDIT_COSTS.liveVoicePerSecond,
			);
		}

		if (usage) {
			await ctx.db.patch(usage._id, { usedSeconds: nextUsed, updatedAt: now });
		} else if (consumed > 0) {
			await ctx.db.insert("realtimeVoiceUsage", {
				ownerId: user._id,
				monthKey: session.monthKey,
				usedSeconds: consumed,
				updatedAt: now,
			});
		}

		await ctx.db.patch(session._id, {
			lastMeteredAt: now,
			usedSeconds: session.usedSeconds + consumed,
			...(shouldEnd
				? {
						endedAt: now,
						endReason:
							affordableSeconds <= delta
								? "ai_credits"
								: nextUsed >= limits.monthlySeconds
									? "monthly_limit"
									: "session_limit",
					}
				: {}),
		});

		return {
			allowed: !shouldEnd,
			remainingSeconds: Math.max(0, limits.monthlySeconds - nextUsed),
			sessionRemainingSeconds: Math.max(
				0,
				limits.maxSessionSeconds - sessionElapsed,
			),
		};
	},
});

export const endSession = mutation({
	args: { sessionId: v.id("realtimeVoiceSessions") },
	handler: async (ctx, args) => {
		const user = await authenticatedUser(ctx);
		const session = await ctx.db.get(args.sessionId);
		if (
			!session ||
			session.ownerId !== user._id ||
			session.endedAt !== undefined
		)
			return null;

		const now = Date.now();
		const limits = REALTIME_VOICE_LIMITS[session.planTier];
		const usage = await usageForMonth(ctx, user._id, session.monthKey);
		const usedSeconds = usage?.usedSeconds ?? 0;
		const delta = Math.max(
			0,
			Math.min(
				HEARTBEAT_GRACE_SECONDS,
				Math.floor((now - session.lastMeteredAt) / 1000),
			),
		);
		const aiCredits = await readAiUsageCredits(ctx, user);
		const affordableSeconds = Math.floor(
			aiCredits.remaining / AI_USAGE_CREDIT_COSTS.liveVoicePerSecond,
		);
		const consumed = Math.min(
			delta,
			Math.max(0, limits.monthlySeconds - usedSeconds),
			affordableSeconds,
		);
		if (consumed > 0) {
			await consumeAiUsageCredits(
				ctx,
				user,
				consumed * AI_USAGE_CREDIT_COSTS.liveVoicePerSecond,
			);
		}

		if (usage && consumed > 0) {
			await ctx.db.patch(usage._id, {
				usedSeconds: usedSeconds + consumed,
				updatedAt: now,
			});
		} else if (!usage && consumed > 0) {
			await ctx.db.insert("realtimeVoiceUsage", {
				ownerId: user._id,
				monthKey: session.monthKey,
				usedSeconds: consumed,
				updatedAt: now,
			});
		}
		await ctx.db.patch(session._id, {
			usedSeconds: session.usedSeconds + consumed,
			lastMeteredAt: now,
			endedAt: now,
			endReason: "user_ended",
		});
		return null;
	},
});
