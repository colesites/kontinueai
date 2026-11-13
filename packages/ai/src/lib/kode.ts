import type { ModelOption } from "./models";

// Kode — Kontinue's coding agent (desktop IDE).
//
// Every Kode model runs on the Vercel AI Gateway through Kontinue's server
// (apps/web/src/app/api/kode/chat), which checks plan access + usage before a
// request and records its real dollar cost after. Prices below mirror the
// gateway catalog (USD per 1M tokens) and drive usage metering, so keep them in
// sync when models are added or repriced.

export const KODE_MODEL_ID = "kontinue/kode-1.0";
export const KODE_DISPLAY_NAME = "Kode 1.0";
export const KODE_PROVIDER = "kontinue";

/** What Kode 1.0 runs on (gateway ids), first one wins, the rest are fallbacks. */
export const KODE_GATEWAY_CHAIN = [
	"deepseek/deepseek-v4.1-flash-1017",
	"minimax/minimax-m3",
	"zai/glm-5.3-flash",
];

/**
 * Output token cap sent with each Kode request. Without one, providers fall
 * back to their own default, which for DeepSeek is a few thousand tokens: a
 * large file write was cut off mid-way, the tool call was lost and the run
 * stopped ("it just cuts off"). Every Kode model and fallback allows at least
 * 64k (AI Gateway catalog, Nov 2026). OpenAI models are left alone: their
 * default is already their maximum and their reasoning models reject
 * `max_tokens`.
 */
export const KODE_MAX_OUTPUT_TOKENS = 64_000;

export function kodeMaxOutputTokens(gatewayId: string): number | null {
	return gatewayId.startsWith("openai/") ? null : KODE_MAX_OUTPUT_TOKENS;
}

// Legacy: the web /api/chat path still serves Kode 1.0 through OpenRouter.
export const KODE_PRIMARY_MODEL = "nex-agi/nex-n2-pro:free";
export const KODE_FALLBACK_MODELS: string[] = [];
export const KODE_MODEL_CHAIN = [KODE_PRIMARY_MODEL, ...KODE_FALLBACK_MODELS];

export function isKodeModel(modelId: string | null | undefined): boolean {
	return modelId === KODE_MODEL_ID;
}

/** Same ids as @repo/core PlanTier. */
export type KodePlan = "free" | "starter" | "plus" | "pro" | "max";

/**
 * light    — cheap, fast models. Free gets a few, Starter/Plus get all.
 * standard — strong mid-price coding models (Pro+).
 * frontier — top models (Pro+).
 * ultra    — the most expensive models: included on Max, extra usage on Pro.
 */
export type KodeModelTier = "light" | "standard" | "frontier" | "ultra";

export type KodePrice = {
	/** USD per 1M input tokens. */
	input: number;
	/** USD per 1M output tokens. */
	output: number;
	/** USD per 1M cached input tokens (read). */
	cacheRead: number;
};

/** Reasoning effort levels, lowest to highest. */
export type KodeEffort = "low" | "medium" | "high" | "xhigh" | "max";
export const KODE_EFFORTS: KodeEffort[] = ["low", "medium", "high", "xhigh", "max"];

export type KodeReasoning = {
	/** Effort levels the provider accepts (empty = on/off only). */
	efforts: KodeEffort[];
	/** Whether reasoning can be turned off entirely. */
	canDisable: boolean;
};

export type KodeModelOption = ModelOption & {
	tier: KodeModelTier;
	reasoning: KodeReasoning;
	/** Free plan can use this light model. */
	free?: boolean;
	/** Gateway id this model routes to. */
	gatewayId: string;
	price: KodePrice;
	/** Faster variant (about 2× the price) used when Fast mode is on. */
	fast?: { gatewayId: string; price: KodePrice };
	contextWindow: number;
};

const p = (input: number, output: number, cacheRead: number): KodePrice => ({
	input,
	output,
	cacheRead,
});

export const KODE_MODELS: KodeModelOption[] = [
	// ── Light ────────────────────────────────────────────────────────────────
	{
		id: KODE_MODEL_ID,
		name: KODE_DISPLAY_NAME,
		provider: KODE_PROVIDER,
		description: "Kontinue's coding agent. Fast, capable and very light on usage.",
		isDefault: true,
		tier: "light",
		reasoning: { efforts: ["low", "high", "max"], canDisable: true },
		free: true,
		gatewayId: "deepseek/deepseek-v4.1-flash-1017",
		price: p(0.3, 1.2, 0.007),
		fast: { gatewayId: "deepseek/deepseek-v4.1-flash-1017-fast", price: p(0.6, 2.4, 0.014) },
		contextWindow: 1_048_576,
	},
	{
		id: "deepseek/deepseek-v4.1-flash",
		name: "DeepSeek V4.1 Flash",
		provider: "deepseek",
		description: "Fast multimodal reasoning and tool calling (Oct 17 release).",
		tier: "light",
		reasoning: { efforts: ["low", "high", "max"], canDisable: true },
		free: true,
		gatewayId: "deepseek/deepseek-v4.1-flash-1017",
		price: p(0.3, 1.2, 0.007),
		fast: { gatewayId: "deepseek/deepseek-v4.1-flash-1017-fast", price: p(0.6, 2.4, 0.014) },
		contextWindow: 1_048_576,
	},
	{
		id: "openai/gpt-6-luna",
		name: "GPT-6 Luna",
		provider: "openai",
		description: "OpenAI's lightest GPT-6. Quick edits and small tasks.",
		tier: "light",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: true },
		free: true,
		gatewayId: "openai/gpt-6-luna",
		price: p(0.1, 0.5, 0.01),
		fast: { gatewayId: "openai/gpt-6-luna-fast", price: p(0.2, 1.0, 0.02) },
		contextWindow: 1_050_000,
	},
	{
		id: "zai/glm-5.3-flash",
		name: "GLM 5.3 Flash",
		provider: "zai",
		description: "Light, long-context coding model.",
		tier: "light",
		reasoning: { efforts: ["low", "high", "max"], canDisable: false },
		gatewayId: "zai/glm-5.3-flash",
		price: p(0.15, 0.5, 0.03),
		contextWindow: 1_000_000,
	},
	{
		id: "minimax/minimax-m3",
		name: "MiniMax M3",
		provider: "minimax",
		description: "Efficient agentic coding model.",
		tier: "light",
		reasoning: { efforts: [], canDisable: false },
		gatewayId: "minimax/minimax-m3",
		price: p(0.3, 1.2, 0.06),
		contextWindow: 512_000,
	},
	{
		id: "google/gemini-3.8-flash",
		name: "Gemini 3.8 Flash",
		provider: "google",
		description: "Fast multimodal model with strong tool use.",
		tier: "light",
		reasoning: { efforts: ["low", "high"], canDisable: false },
		gatewayId: "google/gemini-3.8-flash",
		price: p(0.75, 3.75, 0.075),
		contextWindow: 1_000_000,
	},
	// ── Standard ─────────────────────────────────────────────────────────────
	{
		id: "deepseek/deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		provider: "deepseek",
		description: "Long-context reasoning for complex codebases.",
		tier: "standard",
		reasoning: { efforts: ["low", "high", "max"], canDisable: true },
		gatewayId: "deepseek/deepseek-v4-pro",
		price: p(1.32, 3.96, 0.132),
		contextWindow: 1_048_600,
	},
	{
		id: "zai/glm-5.3",
		name: "GLM 5.3",
		provider: "zai",
		description: "Autonomous long-horizon coding.",
		tier: "standard",
		reasoning: { efforts: ["low", "high", "max"], canDisable: false },
		gatewayId: "zai/glm-5.3",
		price: p(1.4, 4.4, 0.14),
		fast: { gatewayId: "zai/glm-5.3-fast", price: p(2.1, 6.6, 0.21) },
		contextWindow: 1_000_000,
	},
	{
		id: "openai/gpt-6.1-terra",
		name: "GPT-6.1 Terra",
		provider: "openai",
		description: "Balanced GPT-6.1 for everyday engineering.",
		tier: "standard",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: true },
		gatewayId: "openai/gpt-6.1-terra",
		price: p(1.0, 5.0, 0.05),
		fast: { gatewayId: "openai/gpt-6.1-terra-fast", price: p(2.0, 10.0, 0.1) },
		contextWindow: 1_050_000,
	},
	{
		id: "alibaba/qwen3.8-max",
		name: "Qwen 3.8 Max",
		provider: "alibaba",
		description: "Advanced coding and reasoning.",
		tier: "standard",
		reasoning: { efforts: ["low", "medium", "xhigh"], canDisable: true },
		gatewayId: "alibaba/qwen3.8-max",
		price: p(2.0, 6.0, 0.25),
		contextWindow: 262_144,
	},
	{
		id: "spacexai/grok-4.7",
		name: "Grok 4.7",
		provider: "xai",
		description: "Latest Grok, strong at agentic coding.",
		tier: "standard",
		reasoning: { efforts: ["low", "medium", "high", "xhigh"], canDisable: false },
		gatewayId: "spacexai/grok-4.7",
		price: p(2.0, 6.0, 0.5),
		contextWindow: 500_000,
	},
	{
		id: "spacexai/grok-4.6",
		name: "Grok 4.6",
		provider: "xai",
		description: "Fast Grok for coding and reasoning.",
		tier: "standard",
		reasoning: { efforts: ["low", "medium", "high", "xhigh"], canDisable: false },
		gatewayId: "spacexai/grok-4.6",
		price: p(2.0, 6.0, 0.5),
		contextWindow: 500_000,
	},
	{
		id: "moonshotai/kimi-k3.1-pro",
		name: "Kimi K3.1 Pro",
		provider: "moonshotai",
		description: "Long-horizon agentic coding.",
		tier: "standard",
		reasoning: { efforts: ["low", "high", "max"], canDisable: false },
		gatewayId: "moonshotai/kimi-k3.1-pro",
		price: p(2.0, 10.0, 0.2),
		fast: { gatewayId: "moonshotai/kimi-k3.1-pro-highspeed", price: p(4.0, 20.0, 0.2) },
		contextWindow: 1_000_000,
	},
	{
		id: "anthropic/claude-sonnet-5.5",
		name: "Claude Sonnet 5.5",
		provider: "anthropic",
		description: "Anthropic's fast, highly capable coding model.",
		tier: "standard",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: false },
		gatewayId: "anthropic/claude-sonnet-5.5",
		price: p(2.0, 10.0, 0.1),
		contextWindow: 1_000_000,
	},
	{
		id: "google/gemini-4-hydrogen",
		name: "Gemini 4 Hydrogen",
		provider: "google",
		description: "Google's fast Gemini 4 for coding and agent work.",
		tier: "standard",
		reasoning: { efforts: ["low", "medium", "high"], canDisable: false },
		gatewayId: "google/gemini-4-hydrogen",
		price: p(1.5, 7.5, 0.075),
		contextWindow: 1_000_000,
	},
	// ── Frontier ─────────────────────────────────────────────────────────────
	{
		id: "google/gemini-4-argon",
		name: "Gemini 4 Argon",
		provider: "google",
		description: "Google's most capable model.",
		tier: "frontier",
		reasoning: { efforts: ["low", "medium", "high"], canDisable: false },
		gatewayId: "google/gemini-4-argon",
		price: p(2.0, 10.0, 0.1),
		contextWindow: 1_000_000,
	},
	{
		id: "google/gemini-4-carbon",
		name: "Gemini 4 Carbon",
		provider: "google",
		description: "Google's model for complex coding and long agentic work.",
		tier: "frontier",
		reasoning: { efforts: ["low", "medium", "high"], canDisable: false },
		gatewayId: "google/gemini-4-carbon",
		price: p(2.0, 10.0, 0.1),
		contextWindow: 1_000_000,
	},
	{
		id: "openai/gpt-6.1-sol",
		name: "GPT-6.1 Sol",
		provider: "openai",
		description: "OpenAI's flagship for demanding agentic work.",
		tier: "frontier",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: false },
		gatewayId: "openai/gpt-6.1-sol",
		price: p(2.0, 10.0, 0.1),
		fast: { gatewayId: "openai/gpt-6.1-sol-fast", price: p(4.0, 20.0, 0.2) },
		contextWindow: 1_050_000,
	},
	{
		id: "anthropic/claude-opus-5.5",
		name: "Claude Opus 5.5",
		provider: "anthropic",
		description: "Anthropic's flagship coding and reasoning model.",
		tier: "frontier",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: false },
		gatewayId: "anthropic/claude-opus-5.5",
		price: p(4.0, 20.0, 0.2),
		fast: { gatewayId: "anthropic/claude-opus-5.5-fast", price: p(8.0, 40.0, 0.4) },
		contextWindow: 1_000_000,
	},
	// ── Ultra ────────────────────────────────────────────────────────────────
	{
		id: "anthropic/claude-fable-5.2",
		name: "Claude Fable 5.2",
		provider: "anthropic",
		description: "Anthropic's newest and most capable model for the hardest problems.",
		tier: "ultra",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: false },
		gatewayId: "anthropic/claude-fable-5.2",
		price: p(10.0, 50.0, 0.25),
		contextWindow: 1_000_000,
	},
	{
		id: "anthropic/claude-fable-5.1",
		name: "Claude Fable 5.1",
		provider: "anthropic",
		description: "Anthropic's most capable model for the hardest problems.",
		tier: "ultra",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: false },
		gatewayId: "anthropic/claude-fable-5.1",
		price: p(10.0, 50.0, 0.25),
		contextWindow: 1_000_000,
	},
	{
		id: "openai/gpt-6-astra",
		name: "GPT-6 Astra",
		provider: "openai",
		description: "OpenAI's most powerful model.",
		tier: "ultra",
		reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"], canDisable: false },
		gatewayId: "openai/gpt-6-astra",
		price: p(10.0, 50.0, 1.0),
		fast: { gatewayId: "openai/gpt-6-astra-fast", price: p(20.0, 100.0, 2.0) },
		contextWindow: 1_050_000,
	},
];

export const KODE_DEFAULT_MODEL_ID = KODE_MODEL_ID;

export function getKodeModelById(id: string): KodeModelOption | undefined {
	return KODE_MODELS.find((model) => model.id === id);
}

export function getDefaultKodeModel(): KodeModelOption {
	const model = getKodeModelById(KODE_DEFAULT_MODEL_ID) ?? KODE_MODELS[0];
	if (!model) throw new Error("No Kode models configured");
	return model;
}

/**
 * included — counts against the plan's usage windows.
 * credits  — allowed, but paid from extra usage credits only.
 * locked   — needs a higher plan.
 */
export type KodeModelAccess = "included" | "credits" | "locked";

export function getKodeModelAccess(
	model: KodeModelOption,
	plan: KodePlan,
): KodeModelAccess {
	switch (plan) {
		case "free":
			return model.free ? "included" : "locked";
		case "starter":
		case "plus":
			return model.tier === "light" ? "included" : "locked";
		case "pro":
			return model.tier === "ultra" ? "credits" : "included";
		case "max":
			return "included";
	}
}

export function canUseKodeModel(modelId: string, plan: KodePlan): boolean {
	const model = getKodeModelById(modelId);
	return !!model && getKodeModelAccess(model, plan) !== "locked";
}

/** Lowest plan that includes the model (for "Upgrade to …" hints). */
export function minimumKodePlan(model: KodeModelOption): KodePlan {
	if (model.free) return "free";
	if (model.tier === "light") return "starter";
	if (model.tier === "ultra") return "max";
	return "pro";
}

/**
 * Effort to send for a requested level: the requested one if the model
 * supports it, otherwise the nearest supported level.
 */
export function resolveKodeEffort(model: KodeModelOption, requested: KodeEffort): KodeEffort | null {
	const supported = model.reasoning.efforts;
	if (supported.length === 0) return null;
	if (supported.includes(requested)) return requested;
	const target = KODE_EFFORTS.indexOf(requested);
	return [...supported].sort(
		(a, b) => Math.abs(KODE_EFFORTS.indexOf(a) - target) - Math.abs(KODE_EFFORTS.indexOf(b) - target),
	)[0]!;
}

const CONTEXT_PRESETS = [128_000, 256_000, 512_000];
/** Default context budget: large enough for real work, kinder to usage. */
export const KODE_DEFAULT_CONTEXT = 256_000;

/** Context sizes offered for a model, up to its full window. */
export function kodeContextOptions(model: KodeModelOption): number[] {
	const options = CONTEXT_PRESETS.filter((size) => size < model.contextWindow * 0.95);
	return [...options, model.contextWindow];
}

/** Effective context budget for a model given the user's choice (null = default). */
export function kodeContextBudget(model: KodeModelOption, chosen: number | null): number {
	const wanted = chosen ?? KODE_DEFAULT_CONTEXT;
	const options = kodeContextOptions(model);
	return options.filter((size) => size <= wanted).pop() ?? options[0]!;
}

/** Fast mode is a Pro/Max feature, for models that have a fast variant. */
export function canUseFastMode(model: KodeModelOption, plan: KodePlan): boolean {
	return !!model.fast && (plan === "pro" || plan === "max");
}
