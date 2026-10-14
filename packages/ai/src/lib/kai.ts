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

// AI Gateway model IDs. The primary model is Gemini 2.5 Flash Lite,
// offering high-throughput sub-second responses with native reasoning and tool use.
// Ordered fallbacks kick in transparently if the primary experiences rate limits
// or transient errors.
export const K_AI_PRIMARY_MODEL = "google/gemini-2.5-flash-lite";
export const K_AI_FALLBACK_MODELS = [
	"alibaba/qwen3.7-flash",
	"google/gemma-4-31b-it",
];
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
	plus: 3000,
	pro: 5000,
	max: 10000,
} as const;

export type KaiPlanTier = keyof typeof K_AI_MONTHLY_LIMITS;

export function getKaiMonthlyLimit(tier: KaiPlanTier): number {
	return K_AI_MONTHLY_LIMITS[tier];
}
