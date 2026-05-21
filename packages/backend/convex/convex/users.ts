import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getOrCreateUser = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    plan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    if (existing) {
      // Update if needed
      const patches: Partial<
        Pick<
          typeof existing,
          "name" | "imageUrl" | "subscriptionStatus" | "plan"
        >
      > = {};
      if (existing.name !== args.name) patches.name = args.name;
      if (existing.imageUrl !== args.imageUrl) patches.imageUrl = args.imageUrl;
      if (existing.subscriptionStatus !== args.subscriptionStatus)
        patches.subscriptionStatus = args.subscriptionStatus;
      if (existing.plan !== args.plan) patches.plan = args.plan;

      if (Object.keys(patches).length > 0) {
        await ctx.db.patch(existing._id, patches);
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      subscriptionStatus: args.subscriptionStatus,
      plan: args.plan,
      createdAt: Date.now(),
    });
  },
});

export const getUserByClerkId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});

export const getDefaultModel = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    return settings[0]?.defaultModel ?? null;
  },
});

export const setDefaultModel = mutation({
  args: { modelId: v.string() },
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

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    const [existing, ...duplicates] = settings;
    if (existing) {
      if (existing.defaultModel !== args.modelId) {
        await ctx.db.patch(existing._id, { defaultModel: args.modelId });
      }
    } else {
      await ctx.db.insert("userSettings", {
        ownerId: user._id,
        defaultModel: args.modelId,
      });
    }

    await Promise.all(duplicates.map((setting) => ctx.db.delete(setting._id)));

    return args.modelId;
  },
});
