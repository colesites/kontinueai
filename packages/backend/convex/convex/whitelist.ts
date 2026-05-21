import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const isWhitelisted = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("whitelistedEmails")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return !!entry;
  },
});

export const addEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whitelistedEmails")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    
    if (existing) return existing._id;

    return await ctx.db.insert("whitelistedEmails", {
      email: args.email,
      addedAt: Date.now(),
    });
  },
});

export const removeEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whitelistedEmails")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const listEmails = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("whitelistedEmails").collect();
  },
});
