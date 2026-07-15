import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { ConvexError } from "convex/values";
import { getPersistedPlanTier } from "../../lib/plan";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function utcMonthStart(now: number): number {
	const date = new Date(now);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export async function readAiUsageCredits(
	ctx: QueryCtx | MutationCtx,
	user: Doc<"users">,
) {
	const tier = getPersistedPlanTier(user.plan);
	const limit = PLAN_DEFINITIONS[tier].aiUsageCredits;
	const monthStartMs = utcMonthStart(Date.now());
	const row = await ctx.db
		.query("usage")
		.withIndex("by_owner_bucket", (q) =>
			q
				.eq("ownerId", user._id)
				.eq("bucketType", "month_ai_credits")
				.eq("bucketStartMs", monthStartMs),
		)
		.unique();
	const used = row?.requestCount ?? 0;
	return {
		tier,
		limit,
		used,
		remaining: Math.max(0, limit - used),
		monthStartMs,
		row,
	};
}

export async function consumeAiUsageCredits(
	ctx: MutationCtx,
	user: Doc<"users">,
	amount: number,
) {
	const charge = Math.max(0, Math.ceil(amount));
	const state = await readAiUsageCredits(ctx, user);
	if (charge === 0) return state;
	if (charge > state.remaining) {
		throw new ConvexError({
			code: "AI_USAGE_CREDITS_EXHAUSTED",
			message: `Your ${PLAN_DEFINITIONS[state.tier].name} AI usage credits are exhausted for this month.`,
		});
	}
	const now = Date.now();
	if (state.row) {
		await ctx.db.patch(state.row._id, {
			requestCount: state.used + charge,
			updatedAt: now,
		});
	} else {
		await ctx.db.insert("usage", {
			ownerId: user._id,
			bucketType: "month_ai_credits",
			bucketStartMs: state.monthStartMs,
			requestCount: charge,
			updatedAt: now,
		});
	}
	return {
		...state,
		used: state.used + charge,
		remaining: state.remaining - charge,
	};
}

export async function refundAiUsageCredits(
	ctx: MutationCtx,
	user: Doc<"users">,
	amount: number,
) {
	const refund = Math.max(0, Math.ceil(amount));
	if (refund === 0) return;
	const state = await readAiUsageCredits(ctx, user);
	if (!state.row) return;
	await ctx.db.patch(state.row._id, {
		requestCount: Math.max(0, state.used - refund),
		updatedAt: Date.now(),
	});
}
