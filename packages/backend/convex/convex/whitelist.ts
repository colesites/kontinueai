import { persistedPlanForTier, type PlanTier } from "@repo/core/plan-tier";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type DbReader = QueryCtx["db"] | MutationCtx["db"];

const planArg = v.union(
	v.literal("free"),
	v.literal("starter"),
	v.literal("plus"),
	v.literal("pro"),
	v.literal("max"),
);

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function persistedPlan(plan: PlanTier) {
	return persistedPlanForTier(plan);
}

/** Plan string stored for this email, if they are whitelisted with one. */
export async function whitelistPlanForEmail(
	ctx: { db: DbReader },
	email: string,
) {
	const normalized = normalizeEmail(email);
	const entry =
		(await ctx.db
			.query("whitelistedEmails")
			.withIndex("by_email", (q) => q.eq("email", normalized))
			.unique()) ??
		(normalized === email
			? null
			: await ctx.db
					.query("whitelistedEmails")
					.withIndex("by_email", (q) => q.eq("email", email))
					.unique());
	return entry?.plan ?? null;
}

export const isWhitelisted = query({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const plan = await whitelistPlanForEmail(ctx, args.email);
		if (plan) return true;
		const email = normalizeEmail(args.email);
		const entry = await ctx.db
			.query("whitelistedEmails")
			.withIndex("by_email", (q) => q.eq("email", email))
			.unique();
		return !!entry;
	},
});

export const addEmail = mutation({
	args: {
		email: v.string(),
		plan: planArg,
		note: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const email = normalizeEmail(args.email);
		if (!email.includes("@")) throw new Error("Enter a full email address");
		const plan = persistedPlan(args.plan);
		const existing = await ctx.db
			.query("whitelistedEmails")
			.withIndex("by_email", (q) => q.eq("email", email))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, { plan, note: args.note });
			return existing._id;
		}

		return await ctx.db.insert("whitelistedEmails", {
			email,
			plan,
			note: args.note,
			addedAt: Date.now(),
		});
	},
});

export const removeEmail = mutation({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const email = normalizeEmail(args.email);
		const existing = await ctx.db
			.query("whitelistedEmails")
			.withIndex("by_email", (q) => q.eq("email", email))
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
