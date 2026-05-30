import { v } from "convex/values";
import {
  internalMutation,
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

// Read-only lookup that tolerates being signed out. During sign-out the auth
// token briefly drops while subscribed queries are still mounted; throwing here
// surfaces as an unhandled Convex error and crashes the app. Return null instead.
async function getUserOrNull(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

export const listNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await getUserOrNull(ctx);
    if (!user) return [];
    return await ctx.db
      .query("notifications")
      .withIndex("by_owner_created", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(args.limit ?? 30);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUserOrNull(ctx);
    if (!user) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_owner_read", (q) =>
        q.eq("ownerId", user._id).eq("read", false),
      )
      .take(100);
    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.ownerId !== user._id) return null;
    if (!notification.read) await ctx.db.patch(args.notificationId, { read: true });
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_owner_read", (q) =>
        q.eq("ownerId", user._id).eq("read", false),
      )
      .take(200);
    for (const n of unread) await ctx.db.patch(n._id, { read: true });
    return null;
  },
});

// Internal: create a notification (called by the reminder cron / agents).
export const create = internalMutation({
  args: {
    ownerId: v.id("users"),
    type: v.union(
      v.literal("task_reminder"),
      v.literal("task_overdue"),
      v.literal("system"),
    ),
    title: v.string(),
    body: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    chatId: v.optional(v.id("chats")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      ownerId: args.ownerId,
      type: args.type,
      title: args.title,
      body: args.body,
      taskId: args.taskId,
      chatId: args.chatId,
      read: false,
      createdAt: Date.now(),
    });
  },
});
