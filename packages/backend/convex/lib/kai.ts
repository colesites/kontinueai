import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import type { PersistedPlanTier } from "./plan";

export const K_AI_MODEL_ID = "kontinue/k-ai-1.0";
export const K_AI_PRIMARY_MODEL = "google/gemini-2.5-flash-lite";
export const K_AI_MODEL_CHAIN = [
	K_AI_PRIMARY_MODEL,
	"alibaba/qwen3.7-flash",
	"google/gemma-4-31b-it",
];

export function isKaiModel(modelId?: string | null): boolean {
	return modelId === K_AI_MODEL_ID;
}

export function getKaiMonthlyLimit(tier: PersistedPlanTier): number {
	return PLAN_DEFINITIONS[tier].monthlyRequests.kai;
}
