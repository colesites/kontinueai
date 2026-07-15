import {
	isPaidPersistedPlan,
	planTierFromPersisted,
	type PlanTier,
} from "@repo/core/plan-tier";

export type PersistedPlanTier = PlanTier;

export function getPersistedPlanTier(plan?: string | null): PersistedPlanTier {
	return planTierFromPersisted(plan);
}

export function isPersistedPaidPlan(plan?: string | null): boolean {
	return isPaidPersistedPlan(plan);
}
