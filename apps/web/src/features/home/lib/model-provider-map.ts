import type { Provider } from "@repo/utils/url-safety";

export const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  openai: "chatgpt",
  anthropic: "claude",
  google: "gemini",
  deepseek: "unknown",
  minimax: "unknown",
  mistral: "mistral",
  perplexity: "perplexity",
  zai: "unknown",
  alibaba: "unknown",
};
