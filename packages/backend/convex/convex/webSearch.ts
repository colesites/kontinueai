import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import { v } from "convex/values";
import { getPersistedPlanTier } from "../lib/plan";
import { mutation, query } from "./_generated/server";
import { consumeAiUsageCredits } from "./lib/aiUsageCredits";

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

export const consumeSearchQuota = mutation({
	args: {},
	handler: async (ctx): Promise<{ allowed: boolean; remaining: number }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { allowed: false, remaining: 0 };
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user) return { allowed: false, remaining: 0 };

		const tier = getPersistedPlanTier(user.plan);
		const limit = PLAN_DEFINITIONS[tier].webSearches;
		const now = Date.now();
		const bucketStartMs = utcMonthStart(now);
		const existing = await ctx.db
			.query("usage")
			.withIndex("by_owner_bucket", (q) =>
				q
					.eq("ownerId", user._id)
					.eq("bucketType", "month_web_search")
					.eq("bucketStartMs", bucketStartMs),
			)
			.unique();

		const used = existing?.requestCount ?? 0;
		if (used >= limit) return { allowed: false, remaining: 0 };
		await consumeAiUsageCredits(ctx, user, AI_USAGE_CREDIT_COSTS.webSearch);
		if (existing) {
			await ctx.db.patch(existing._id, {
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
		return { allowed: true, remaining: limit - used - 1 };
	},
});

export const getSearchUsage = query({
	args: {},
	handler: async (ctx) => {
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
		return { used: row?.requestCount ?? 0, limit, tier };
	},
});
