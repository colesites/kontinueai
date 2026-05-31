import type { PersistedPlanTier } from "./plan";

// Kept in sync with @repo/ai/lib/kai (Convex can't import app packages directly).
export const K_AI_MODEL_ID = "kontinue/k-ai-1.0";

// OpenRouter model chain (primary + fallbacks). Kept in sync with
// packages/ai/src/lib/kai.ts. Used by autonomous agent-task execution.
export const K_AI_PRIMARY_MODEL = "google/gemma-4-31b-it:free";
export const K_AI_MODEL_CHAIN = [K_AI_PRIMARY_MODEL, "openai/gpt-oss-120b:free"];

export function isKaiModel(modelId?: string | null): boolean {
  return modelId === K_AI_MODEL_ID;
}

// Per-plan monthly REQUEST limits for K-AI 1.0 (independent of raw-model
// quotas). Pro is unlimited.
const K_AI_MONTHLY_LIMITS: Record<PersistedPlanTier, number> = {
  free: 1000,
  starter: 2000,
  pro: Number.POSITIVE_INFINITY,
};

export function getKaiMonthlyLimit(tier: PersistedPlanTier): number {
  return K_AI_MONTHLY_LIMITS[tier];
}
