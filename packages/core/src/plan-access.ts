import {
	type ModelAccessClass,
	STARTER_BASIC_MODEL_IDS,
} from "./model-pricing";
import type { PlanTier } from "./plan-tier";
import { isPlanAtLeast } from "./plan-tier";

export type PlanFeature =
	| "file-upload"
	| "premium-model"
	| "code-execution"
	| "realtime-voice"
	| "kode"
	| "canvas";

export function canAccessPlanFeature(
	tier: PlanTier,
	feature: PlanFeature,
): boolean {
	if (
		feature === "realtime-voice" ||
		feature === "kode" ||
		feature === "canvas"
	) {
		return isPlanAtLeast(tier, "pro");
	}
	if (feature === "premium-model") return isPlanAtLeast(tier, "plus");
	// Sandboxed code execution boots a microVM per run, so it is paid-only.
	if (feature === "code-execution") return isPlanAtLeast(tier, "plus");
	return isPlanAtLeast(tier, "starter");
}

export function canAccessModelClass(
	tier: PlanTier,
	modelClass: ModelAccessClass,
): boolean {
	if (modelClass === "frontier") return isPlanAtLeast(tier, "pro");
	if (modelClass === "pro") return isPlanAtLeast(tier, "plus");
	return isPlanAtLeast(tier, "starter");
}

export function canAccessModel(
	tier: PlanTier,
	modelId: string,
	modelClass: ModelAccessClass,
): boolean {
	if (!canAccessModelClass(tier, modelClass)) return false;
	if (tier === "starter") {
		return modelClass === "basic" && STARTER_BASIC_MODEL_IDS.has(modelId);
	}
	return true;
}
