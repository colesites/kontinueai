import { clerkClient } from "@clerk/nextjs/server";
import type { ModelAccessClass } from "@repo/core/model-pricing";
import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import {
	type BillingUserLike,
	MAX_PLAN_ID,
	PLUS_PLAN_ID,
	type PlanTier,
	PRO_PLAN_ID,
	resolvePlanTierFromBillingSignals,
	STARTER_PLAN_ID,
} from "@repo/core/plan-tier";

export async function getUserPlanTier(
	clerkUserId: string,
	hasPlan?: (args: { plan: string }) => boolean,
): Promise<PlanTier> {
	const hasStarterPlan = hasPlan?.({ plan: STARTER_PLAN_ID }) ?? false;
	const hasPlusPlan = hasPlan?.({ plan: PLUS_PLAN_ID }) ?? false;
	const hasProPlan = hasPlan?.({ plan: PRO_PLAN_ID }) ?? false;
	const hasMaxPlan = hasPlan?.({ plan: MAX_PLAN_ID }) ?? false;

	if (hasMaxPlan) return "max";
	if (hasProPlan) return "pro";
	if (hasPlusPlan) return "plus";
	if (hasStarterPlan) return "starter";

	const client = await clerkClient();
	const user = await client.users.getUser(clerkUserId);

	return resolvePlanTierFromBillingSignals({
		hasStarterPlan,
		hasPlusPlan,
		hasProPlan,
		hasMaxPlan,
		billingUser: user as unknown as BillingUserLike,
	});
}

export function getTokenLimitsByTier(options: {
	planTier: PlanTier;
	modelClass: "kai" | ModelAccessClass;
}): { maxInputTokens: number; maxOutputTokens: number; tierLabel: string } {
	const { planTier, modelClass } = options;
	const plan = PLAN_DEFINITIONS[planTier];
	return {
		maxInputTokens: plan.contextTokens[modelClass],
		maxOutputTokens: plan.maxOutputTokens[modelClass],
		tierLabel: `${plan.name} users on ${modelClass === "kai" ? "K-AI" : `${modelClass} models`}`,
	};
}
