import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

// Whether the current user has at least one active push subscription.
export const hasPushSubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .first();
    return sub !== null;
  },
});

// Upsert a browser push subscription for the current user (keyed by endpoint).
export const savePushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();

    if (existing) {
      // Re-claim/refresh keys (endpoint may be reissued to the same user).
      await ctx.db.patch(existing._id, {
        ownerId: user._id,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushSubscriptions", {
      ownerId: user._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });
  },
});

export const deletePushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing && existing.ownerId === user._id) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

// ── Internal helpers used by the reminder delivery action ──────────────

export const getSubscriptionsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .take(20);
  },
});

// Remove a subscription that the push service rejected (404/410 = gone).
export const removeSubscriptionByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// Resolve the email + channel prefs needed to deliver a reminder.
export const getDeliveryProfile = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .unique();
    const channels = settings?.reminderChannels;
    return {
      email: user?.email ?? null,
      // Default channels on when no explicit preference is stored.
      emailEnabled: channels?.email ?? true,
      pushEnabled: channels?.push ?? true,
    };
  },
});
