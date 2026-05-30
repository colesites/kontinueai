import type { ModelOption } from "./models";
import { K_AI_MODEL_ID, K_AI_DISPLAY_NAME, K_AI_PROVIDER } from "./kai";

// K-AI 1.0 — Kontinue's own intelligence layer. Unlike the other providers it
// does not route through the AI Gateway (it uses OpenRouter with failover); the
// chat route special-cases it. Listed first so it's the headline option.
export const KONTINUE_MODELS: ModelOption[] = [
  {
    id: K_AI_MODEL_ID,
    name: K_AI_DISPLAY_NAME,
    provider: K_AI_PROVIDER,
    description: "Kontinue's best AI model",
    isDefault: true,
  },
];
