import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { ConvexError, v } from "convex/values";
import { getPersistedPlanTier } from "../lib/plan";
import {
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import {
	consumeAiUsageCredits,
	readAiUsageCredits,
} from "./lib/aiUsageCredits";

function utcMonthStart(nowMs: number): number {
	const date = new Date(nowMs);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

const sourceValidator = v.object({
	title: v.string(),
	url: v.string(),
	snippet: v.optional(v.string()),
});

export const getCached = query({
	args: { queryKey: v.string() },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("webSearchCache")
			.withIndex("by_query_key", (q) => q.eq("queryKey", args.queryKey))
			.order("desc")
			.first();
		if (!row || row.expiresAt <= Date.now()) return null;
		return {
			contextText: row.contextText,
			sources: row.sources,
			provider: row.provider,
			cached: true as const,
		};
	},
});

export const store = mutation({
	args: {
		queryKey: v.string(),
		query: v.string(),
		contextText: v.string(),
		sources: v.array(sourceValidator),
		provider: v.string(),
		ttlMs: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query("webSearchCache")
			.withIndex("by_query_key", (q) => q.eq("queryKey", args.queryKey))
			.first();
		const doc = {
			queryKey: args.queryKey,
			query: args.query,
			contextText: args.contextText,
			sources: args.sources,
			provider: args.provider,
			createdAt: now,
			expiresAt: now + (args.ttlMs ?? 24 * 60 * 60 * 1000),
		};
		if (existing) await ctx.db.patch(existing._id, doc);
		else await ctx.db.insert("webSearchCache", doc);
		return null;
	},
});

// Result of a quota check/consume. `reason` says WHY a search was refused so the
// caller can tell the user something specific instead of silently not searching.
export type SearchQuotaReason =
	| "ok"
	| "unauthenticated"
	| "monthly_limit"
	| "credits_exhausted";

async function loadQuotaState(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;
	const user = await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
	if (!user) return null;

	const tier = getPersistedPlanTier(user.plan);
	const limit = PLAN_DEFINITIONS[tier].webSearches;
	const bucketStartMs = utcMonthStart(Date.now());
	const row = await ctx.db
		.query("usage")
		.withIndex("by_owner_bucket", (q) =>
			q
				.eq("ownerId", user._id)
				.eq("bucketType", "month_web_search")
				.eq("bucketStartMs", bucketStartMs),
		)
		.unique();
	const used = row?.requestCount ?? 0;
	const credits = await readAiUsageCredits(ctx, user);
	return { user, tier, limit, used, bucketStartMs, row, credits };
}

// Read-only quota probe. Callers use this BEFORE deciding whether to offer web
// search on a turn — attaching the tool when the budget is already spent only
// produces a search we would have to refuse (or fail to count) afterwards.
// This never consumes anything; `consumeSearchQuota` does that, once per search
// that actually runs.
export const checkSearchQuota = query({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		allowed: boolean;
		reason: SearchQuotaReason;
		used: number;
		limit: number;
		remaining: number;
		creditsRemaining: number;
	}> => {
		const state = await loadQuotaState(ctx);
		if (!state) {
			return {
				allowed: false,
				reason: "unauthenticated",
				used: 0,
				limit: 0,
				remaining: 0,
				creditsRemaining: 0,
			};
		}
		const remaining = Math.max(0, state.limit - state.used);
		const creditsRemaining = state.credits.remaining;
		const reason: SearchQuotaReason =
			remaining <= 0
				? "monthly_limit"
				: creditsRemaining < AI_USAGE_CREDIT_COSTS.webSearch
					? "credits_exhausted"
					: "ok";
		return {
			allowed: reason === "ok",
			reason,
			used: state.used,
			limit: state.limit,
			remaining,
			creditsRemaining,
		};
	},
});

// Charge one web search against the monthly bucket + AI usage credits.
//
// This is called once per search that ACTUALLY runs, whether the user flipped
// the Web Search toggle on or the model/pipeline decided on its own that the
// question needed live data. Auto-triggered searches cost exactly the same as
// manual ones — `source` is telemetry only and never changes the charge.
export const consumeSearchQuota = mutation({
	args: {
		source: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		allowed: boolean;
		reason: SearchQuotaReason;
		remaining: number;
	}> => {
		const state = await loadQuotaState(ctx);
		if (!state) {
			return { allowed: false, reason: "unauthenticated", remaining: 0 };
		}
		const { user, limit, used, bucketStartMs, row } = state;
		if (used >= limit) {
			return { allowed: false, reason: "monthly_limit", remaining: 0 };
		}

		// Credit exhaustion must not take the whole chat turn down with it: the
		// answer can still be given model-only. Swallow the ConvexError here and
		// report it as a refused search instead.
		try {
			await consumeAiUsageCredits(ctx, user, AI_USAGE_CREDIT_COSTS.webSearch);
		} catch (error) {
			if (error instanceof ConvexError) {
				return {
					allowed: false,
					reason: "credits_exhausted",
					remaining: Math.max(0, limit - used),
				};
			}
			throw error;
		}

		const now = Date.now();
		if (row) {
			await ctx.db.patch(row._id, {
				requestCount: used + 1,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("usage", {
				ownerId: user._id,
				bucketType: "month_web_search",
				bucketStartMs,
				requestCount: 1,
				updatedAt: now,
			});
		}
		console.log("[web-search] quota consumed", {
			source: args.source ?? "manual",
			used: used + 1,
			limit,
		});
		return { allowed: true, reason: "ok", remaining: limit - used - 1 };
	},
});

export const getSearchUsage = query({
	args: {},
	handler: async (ctx) => {
		const state = await loadQuotaState(ctx);
		if (!state) return null;
		return { used: state.used, limit: state.limit, tier: state.tier };
	},
});
