import type { ModelOption } from "./models";

// Kode 1.0 — Kontinue's coding model for Kode IDE.
//
// Like K-AI, this is a branded orchestration layer. The UI should present
// "Kode 1.0" while server routes resolve it to the OpenRouter slug below.
export const KODE_MODEL_ID = "kontinue/kode-1.0";
export const KODE_DISPLAY_NAME = "Kode 1.0";
export const KODE_PROVIDER = "kontinue";

// Kode 1.0 (the Kode IDE coding model) runs on Nex N2 Pro (free, tool-capable,
// 262K ctx) via OpenRouter — see the IDE's Rust route in
// apps/kode-ide/src-tauri/src/lib.rs (KODE_OPENROUTER_MODEL_ID). The identity lock
// keeps it presenting as "Kode 1.0 by Kontinue AI". The IDE is the real home of
// Kode 1.0; the web /api/chat path is not offered in the web model picker.
export const KODE_PRIMARY_MODEL = "nex-agi/nex-n2-pro:free";
export const KODE_FALLBACK_MODELS: string[] = [];
export const KODE_MODEL_CHAIN = [KODE_PRIMARY_MODEL, ...KODE_FALLBACK_MODELS];

export function isKodeModel(modelId: string | null | undefined): boolean {
	return modelId === KODE_MODEL_ID;
}

export type KodePlanTier = "free" | "starter" | "pro";

export type KodeModelAccess = {
	modelId: string;
	minimumPlan: KodePlanTier;
};

export type KodeModelOption = ModelOption & {
	minimumPlan: KodePlanTier;
};

export const KODE_MODEL_ACCESS: KodeModelAccess[] = [
	{ modelId: KODE_MODEL_ID, minimumPlan: "free" },
	{ modelId: "minimax/minimax-m3", minimumPlan: "starter" },
	{ modelId: "z-ai/glm-5.1", minimumPlan: "starter" },
	{ modelId: "deepseek/deepseek-v4-pro", minimumPlan: "starter" },
	{ modelId: "x-ai/grok-build-0.1", minimumPlan: "starter" },
	{ modelId: "qwen/qwen3.7-max", minimumPlan: "starter" },
	{ modelId: "anthropic/claude-opus-4.8", minimumPlan: "pro" },
	{ modelId: "anthropic/claude-opus-5", minimumPlan: "pro" },
	{ modelId: "google/gemini-3.5-flash", minimumPlan: "pro" },
	{ modelId: "openai/gpt-5.5", minimumPlan: "pro" },
	{ modelId: "openai/gpt-5.6-sol", minimumPlan: "pro" },
];

export const KODE_MODELS: KodeModelOption[] = [
	{
		id: KODE_MODEL_ID,
		name: KODE_DISPLAY_NAME,
		provider: KODE_PROVIDER,
		description: "Kontinue's coding model for Kode IDE",
		isDefault: true,
		minimumPlan: "free",
	},
	{
		id: "minimax/minimax-m3",
		name: "MiniMax M3",
		provider: "minimax",
		description: "High-performance coding and agent model.",
		minimumPlan: "starter",
	},
	{
		id: "z-ai/glm-5.1",
		name: "GLM 5.1",
		provider: "zai",
		description: "Autonomous long-horizon coding model.",
		minimumPlan: "starter",
	},
	{
		id: "deepseek/deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		provider: "deepseek",
		description: "Long-context reasoning and complex coding model.",
		minimumPlan: "starter",
	},
	{
		id: "x-ai/grok-build-0.1",
		name: "Grok Build 0.1",
		provider: "xai",
		description: "Agentic software-building model.",
		minimumPlan: "starter",
	},
	{
		id: "qwen/qwen3.7-max",
		name: "Qwen 3.7 Max",
		provider: "alibaba",
		description: "Advanced coding and reasoning model.",
		minimumPlan: "starter",
	},
	{
		id: "anthropic/claude-opus-4.8",
		name: "Claude Opus 4.8",
		provider: "anthropic",
		description: "Frontier coding and professional reasoning model.",
		minimumPlan: "pro",
	},
	{
		id: "anthropic/claude-opus-5",
		name: "Claude Opus 5",
		provider: "anthropic",
		description: "Anthropic's flagship agentic coding and reasoning model.",
		minimumPlan: "pro",
	},
	{
		id: "google/gemini-3.5-flash",
		name: "Gemini 3.5 Flash",
		provider: "google",
		description: "Fast coding and multimodal model.",
		minimumPlan: "pro",
	},
	{
		id: "openai/gpt-5.5",
		name: "GPT 5.5",
		provider: "openai",
		description: "General-purpose coding and research model.",
		minimumPlan: "pro",
	},
	{
		id: "openai/gpt-5.6-sol",
		name: "GPT 5.6 Sol",
		provider: "openai",
		description: "OpenAI's highest-capability model for demanding agentic work.",
		minimumPlan: "pro",
	},
];

export const KODE_DEFAULT_MODEL_ID = KODE_MODEL_ID;

const PLAN_RANK: Record<KodePlanTier, number> = {
	free: 0,
	starter: 1,
	pro: 2,
};

export function canUseKodeModel(
	modelId: string,
	planTier: KodePlanTier,
): boolean {
	const access = KODE_MODEL_ACCESS.find((item) => item.modelId === modelId);
	if (!access) return false;
	return PLAN_RANK[planTier] >= PLAN_RANK[access.minimumPlan];
}

export function getKodeModelById(id: string): ModelOption | undefined {
	return KODE_MODELS.find((model) => model.id === id);
}

export function getDefaultKodeModel(): ModelOption {
	const model = getKodeModelById(KODE_DEFAULT_MODEL_ID) ?? KODE_MODELS[0];

	if (!model) {
		throw new Error("No Kode models configured");
	}

	return model;
}
