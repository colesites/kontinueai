import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import type { PersistedPlanTier } from "./plan";

export const K_AI_MODEL_ID = "kontinue/k-ai-1.0";
export const K_AI_PRIMARY_MODEL = "google/gemma-4-31b-it:free";
export const K_AI_MODEL_CHAIN = [
	K_AI_PRIMARY_MODEL,
	"openai/gpt-oss-120b:free",
];

export function isKaiModel(modelId?: string | null): boolean {
	return modelId === K_AI_MODEL_ID;
}

export function getKaiMonthlyLimit(tier: PersistedPlanTier): number {
	return PLAN_DEFINITIONS[tier].monthlyRequests.kai;
}
