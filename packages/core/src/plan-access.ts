import type { PlanTier } from "./plan-tier";

export type PlanFeature = "file-upload" | "premium-model" | "kode";

export function canAccessPlanFeature(
	tier: PlanTier,
	feature: PlanFeature,
): boolean {
	if (feature === "kode") return tier === "pro";
	return tier === "starter" || tier === "pro";
}
