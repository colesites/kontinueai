import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { consumeVideoCredits, readCreditState } from "./lib/videoCredits";

// ── Helpers ───────────────────────────────────────────────

async function authenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return { identity, user };
}

// ── Credits ───────────────────────────────────────────────
// Video credits come from two pools: a monthly allowance (Pro only) and a
// persistent referral-bonus pool (any tier). See lib/videoCredits.ts.

export const getCredits = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await authenticatedUser(ctx);
    const state = await readCreditState(ctx, user);

    return {
      // Back-compat top-level fields mirror the monthly allowance.
      total: state.monthly.total,
      used: state.monthly.used,
      remaining: state.monthly.remaining,
      monthKey: state.monthKey,
      // Combined view the UI uses for gating + display.
      isPro: state.isPro,
      monthly: state.monthly,
      bonus: state.bonus,
      available: state.available,
    };
  },
});

export const deductCredits = mutation({
  args: {
    seconds: v.number(),
    modelId: v.string(),
    resolution: v.optional(v.string()),
    quality: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
  },
  handler: async (
    ctx,
    { seconds, modelId, resolution, quality = "standard" },
  ) => {
    const isFree =
      modelId.includes("wan") ||
      modelId.includes("flash") ||
      modelId.includes("lite");

    if (isFree) {
      return { remaining: undefined };
    }

    const { user } = await authenticatedUser(ctx);

    // Calculate cost based on model features
    let multiplier = 15; // Default

    if (modelId.includes("kling")) {
      multiplier = quality === "pro" ? 20 : 15;
    } else if (resolution) {
      if (resolution.includes("1080") || resolution === "1080p") {
        multiplier = 20;
      } else if (resolution.includes("720") || resolution === "720p") {
        multiplier = 15;
      } else if (resolution.includes("480") || resolution === "480p") {
        multiplier = 10;
      }
    }

    const cost = seconds * multiplier;
    if (cost === 0) return { remaining: undefined };

    // Draws from the monthly allowance first (Pro) then the referral-bonus pool;
    // throws if the user has insufficient credits.
    return await consumeVideoCredits(ctx, user, cost);
  },
});

// ── Creations CRUD ────────────────────────────────────────

export const createCreation = mutation({
  args: {
    mediaType: v.union(v.literal("image"), v.literal("video")),
    mediaUrl: v.string(),
    pathname: v.string(),
    prompt: v.string(),
    modelId: v.string(),
    aspectRatio: v.string(),
    duration: v.optional(v.number()),
    quality: v.optional(v.string()),
    audio: v.optional(v.boolean()),
    referenceImageUrl: v.optional(v.string()),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await authenticatedUser(ctx);
    return await ctx.db.insert("canvasCreations", {
      ownerId: user._id,
      ownerName: user.name ?? undefined,
      ownerImageUrl: user.imageUrl ?? undefined,
      ...args,
      isPublished: false,
      likeCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const publishCreation = mutation({
  args: { creationId: v.id("canvasCreations") },
  handler: async (ctx, { creationId }) => {
    const { user } = await authenticatedUser(ctx);
    const creation = await ctx.db.get(creationId);
    if (!creation) throw new Error("Creation not found");
    if (!creation.isPublished && creation.ownerId !== user._id) {
      throw new Error("Creation not found");
    }
    if (creation.ownerId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(creationId, { isPublished: !creation.isPublished });
    return { isPublished: !creation.isPublished };
  },
});

export const listPublished = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sortBy: v.optional(v.union(v.literal("likes"), v.literal("recent"))),
  },
  handler: async (ctx, { paginationOpts, sortBy = "likes" }) => {
    if (sortBy === "likes") {
      return await ctx.db
        .query("canvasCreations")
        .withIndex("by_published", (q) => q.eq("isPublished", true))
        .order("desc")
        .paginate(paginationOpts);
    }

    return await ctx.db
      .query("canvasCreations")
      .withIndex("by_published_created", (q) => q.eq("isPublished", true))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const listMyCreations = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const { user } = await authenticatedUser(ctx);
    return await ctx.db
      .query("canvasCreations")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const getCreation = query({
  args: { creationId: v.id("canvasCreations") },
  handler: async (ctx, { creationId }) => {
    const creation = await ctx.db.get(creationId);
    if (!creation || creation.isPublished) return creation;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
    return user && creation.ownerId === user._id ? creation : null;
  },
});

// ── Likes ─────────────────────────────────────────────────

export const toggleLike = mutation({
  args: { creationId: v.id("canvasCreations") },
  handler: async (ctx, { creationId }) => {
    const { user } = await authenticatedUser(ctx);

    const creation = await ctx.db.get(creationId);
    if (!creation) throw new Error("Creation not found");
    if (!creation.isPublished && creation.ownerId !== user._id) {
      throw new Error("Creation not found");
    }

    const existingLike = await ctx.db
      .query("canvasLikes")
      .withIndex("by_creation_owner", (q) =>
        q.eq("creationId", creationId).eq("ownerId", user._id),
      )
      .first();

    if (existingLike) {
      await ctx.db.delete(existingLike._id);
      await ctx.db.patch(creationId, {
        likeCount: Math.max(0, creation.likeCount - 1),
      });
      return { liked: false };
    }

    await ctx.db.insert("canvasLikes", {
      creationId,
      ownerId: user._id,
      createdAt: Date.now(),
    });
    await ctx.db.patch(creationId, {
      likeCount: creation.likeCount + 1,
    });
    return { liked: true };
  },
});

export const getMyLikes = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await authenticatedUser(ctx);
    const likes = await ctx.db
      .query("canvasLikes")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return likes.map((l) => l.creationId);
  },
});

export const deleteCreation = mutation({
  args: { creationId: v.id("canvasCreations") },
  handler: async (ctx, { creationId }) => {
    const { user } = await authenticatedUser(ctx);
    const creation = await ctx.db.get(creationId);
    if (!creation) throw new Error("Creation not found");
    if (creation.ownerId !== user._id) throw new Error("Unauthorized");

    // Delete all likes for this creation
    const likes = await ctx.db
      .query("canvasLikes")
      .withIndex("by_creation_owner", (q) => q.eq("creationId", creationId))
      .collect();
    for (const like of likes) {
      await ctx.db.delete(like._id);
    }

    await ctx.db.delete(creationId);
    return { pathname: creation.pathname };
  },
});
