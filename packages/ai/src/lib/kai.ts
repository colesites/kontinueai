// K-AI 1.0 — Kontinue's proprietary intelligence layer.
//
// IMPORTANT: K-AI 1.0 is NOT a trained foundation model. It is an orchestration
// layer on top of open-source models, made to feel significantly smarter than
// the base model through memory, RAG, projects, tasks, connectors and agent
// specialization. Underlying model names are NEVER surfaced to users — the
// frontend only ever shows "K-AI 1.0".

export const K_AI_MODEL_ID = "kontinue/k-ai-1.0";
export const K_AI_DISPLAY_NAME = "K-AI 1.0";
export const K_AI_PROVIDER = "kontinue";

// OpenRouter model slugs. The first entry is the primary model; the remaining
// entries are ordered fallbacks. We hand the whole list to OpenRouter, which
// automatically fails over (rate limits, provider downtime, model errors)
// across them within a single request. See router in the chat route.
export const K_AI_PRIMARY_MODEL = "google/gemma-4-31b-it:free";
export const K_AI_FALLBACK_MODELS = ["openai/gpt-oss-120b:free"];
export const K_AI_MODEL_CHAIN = [K_AI_PRIMARY_MODEL, ...K_AI_FALLBACK_MODELS];

export function isKaiModel(modelId: string | null | undefined): boolean {
  return modelId === K_AI_MODEL_ID;
}

// Per-plan monthly REQUEST limits for K-AI 1.0. These are independent of the
// raw-model message quotas — K-AI has no per-message token in/out caps, only
// this monthly request budget. Pro is unlimited.
export const K_AI_MONTHLY_LIMITS = {
  free: 1000,
  starter: 2000,
  pro: Number.POSITIVE_INFINITY,
} as const;

export type KaiPlanTier = keyof typeof K_AI_MONTHLY_LIMITS;

export function getKaiMonthlyLimit(tier: KaiPlanTier): number {
  return K_AI_MONTHLY_LIMITS[tier];
}
