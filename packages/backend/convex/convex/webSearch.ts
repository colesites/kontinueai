import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getPersistedPlanTier } from "../lib/plan";

// Free users get a limited number of K-AI web searches per UTC day. Paid tiers
// are effectively unlimited (a high ceiling guards against runaway costs).
const FREE_DAILY_SEARCH_LIMIT = 10;
const PAID_DAILY_SEARCH_LIMIT = 1000;

function utcDayStart(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const sourceValidator = v.object({
  title: v.string(),
  url: v.string(),
  snippet: v.optional(v.string()),
});

// ── Cache: read a non-expired cached result for a normalized query key ────────
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

// ── Cache: store a fresh result (upserts by query key) ────────────────────────
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
    const ttl = args.ttlMs ?? 24 * 60 * 60 * 1000; // default 24h
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
      expiresAt: now + ttl,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("webSearchCache", doc);
    return null;
  },
});

// ── Quota: check + increment the caller's daily K-AI web-search budget ────────
// Called only on a cache miss (an actual provider hit). Throws when exhausted so
// the route can fall back to a model-only answer.
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
    const limit =
      tier === "free" ? FREE_DAILY_SEARCH_LIMIT : PAID_DAILY_SEARCH_LIMIT;

    const now = Date.now();
    const bucketStartMs = utcDayStart(now);
    const existing = await ctx.db
      .query("usage")
      .withIndex("by_owner_bucket", (q) =>
        q
          .eq("ownerId", user._id)
          .eq("bucketType", "day_kai_search")
          .eq("bucketStartMs", bucketStartMs),
      )
      .unique();

    const used = existing?.requestCount ?? 0;
    if (used >= limit) {
      return { allowed: false, remaining: 0 };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        requestCount: used + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("usage", {
        ownerId: user._id,
        bucketType: "day_kai_search",
        bucketStartMs,
        requestCount: 1,
        updatedAt: now,
      });
    }
    return { allowed: true, remaining: limit - used - 1 };
  },
});

// ── Usage read for the UI (today's web-search count vs limit) ─────────────────
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
    const limit =
      tier === "free" ? FREE_DAILY_SEARCH_LIMIT : PAID_DAILY_SEARCH_LIMIT;
    const bucketStartMs = utcDayStart(Date.now());
    const row = await ctx.db
      .query("usage")
      .withIndex("by_owner_bucket", (q) =>
        q
          .eq("ownerId", user._id)
          .eq("bucketType", "day_kai_search")
          .eq("bucketStartMs", bucketStartMs),
      )
      .unique();
    return { used: row?.requestCount ?? 0, limit, tier };
  },
});
