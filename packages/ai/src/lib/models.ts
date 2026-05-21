export interface ModelOption {
  id: string; // Format: "provider/model" for Vercel AI Gateway
  name: string;
  provider:
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "deepseek"
  | "perplexity"
  | "minimax"
  | "zai"
  | "alibaba"
  | "moonshotai"
  | "mistral";
  description: string;
  isDefault?: boolean;
}

import { OPENAI_MODELS } from "./openai";
import { ANTHROPIC_MODELS } from "./anthropic";
import { GOOGLE_MODELS } from "./google";
import { XAI_MODELS } from "./xai";
import { DEEPSEEK_MODELS } from "./deepseek";
import { PERPLEXITY_MODELS } from "./perplexity";
import { MINIMAX_MODELS } from "./minimax";
import { ZAI_MODELS } from "./zai";
import { ALIBABA_MODELS } from "./alibaba";
import { MOONSHOTAI_MODELS } from "./moonshotai";
import { MISTRAL_MODELS } from "./mistral";

// Using Vercel AI Gateway format: "provider/model"
// All accessible with a single AI_GATEWAY_API_KEY (or AI_GATEWAY_TOKEN) via AI Gateway
export const AVAILABLE_MODELS: ModelOption[] = [
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
  ...GOOGLE_MODELS,
  ...XAI_MODELS,
  ...DEEPSEEK_MODELS,
  ...PERPLEXITY_MODELS,
  ...MINIMAX_MODELS,
  ...ZAI_MODELS,
  ...ALIBABA_MODELS,
  ...MOONSHOTAI_MODELS,
  ...MISTRAL_MODELS,
];

export const FREE_DEFAULT_MODEL_ID = "openai/gpt-5.4-mini";
export const PRO_DEFAULT_MODEL_ID = "openai/gpt-5.5-pro";

// Models that should remain usable on the free plan even if the AI Gateway
// metadata suggests they have "premium" capabilities.
export const ALWAYS_FREE_MODEL_IDS = new Set<string>([
  FREE_DEFAULT_MODEL_ID,
  "alibaba/wan-v2.6-t2v",
  "alibaba/wan-v2.6-i2v",
  "alibaba/wan-v2.6-i2v-flash",
  "alibaba/wan-v2.6-r2v",
  "alibaba/wan-v2.6-r2v-flash",
  "alibaba/wan-v2.5-t2v-preview",
]);

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}

export function getDefaultModel(): ModelOption {
  const model =
    getModelById(FREE_DEFAULT_MODEL_ID) ??
    AVAILABLE_MODELS.find((m) => m.isDefault) ??
    AVAILABLE_MODELS[0];

  if (!model) {
    throw new Error("No AI models configured");
  }

  return model;
}


export function getDefaultModelForPlan(isPro: boolean): ModelOption {
  const preferredId = isPro ? PRO_DEFAULT_MODEL_ID : FREE_DEFAULT_MODEL_ID;
  return getModelById(preferredId) ?? getDefaultModel();
}

export function getProviderColor(provider: ModelOption["provider"]): string {
  const colors = {
    openai: "#10a37f",
    anthropic: "#cc785c",
    google: "#4285f4",
    xai: "#000000",
    deepseek: "#3b82f6",
    perplexity: "#20b8cd",
    minimax: "#a855f7",
    zai: "#f97316",
    alibaba: "#ef4444",
    moonshotai: "#fbbf24",
    mistral: "#ffffff",
  };
  return colors[provider];
}
