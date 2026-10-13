import type { ModelOption } from "./models";

export const MISTRAL_MODELS: ModelOption[] = [
  {
    id: "mistral/mistral-large-4",
    name: "Mistral Large 4",
    provider: "mistral",
    description: "Mistral's latest flagship open-weight multimodal model with 1T+ token context",
  },
  {
    id: "mistral/mistral-medium-3.5",
    name: "Mistral Medium Latest",
    provider: "mistral",
    description: "Frontier-class multimodal model optimized for agentic and coding workflows",
  },
  {
    id: "mistral/mistral-large-3",
    name: "Mistral Large 3",
    provider: "mistral",
    description: "High-performance sparse MoE model with 41B active parameters",
  },
  {
    id: "mistral/codestral",
    name: "Mistral Codestral",
    provider: "mistral",
    description: "State-of-the-art generative model purpose-built for code generation and completion",
  },
  {
    id: "mistral/devstral-2",
    name: "Devstral 2",
    provider: "mistral",
    description: "Enterprise-grade text model",
  },
  {
    id: "mistral/ministral-14b",
    name: "Ministral 14B",
    provider: "mistral",
    description: "Multimodal edge powerhouse",
  },
  {
    id: "mistral/ministral-8b",
    name: "Ministral 8B",
    provider: "mistral",
    description: "Fast edge model with efficient inference for complex workflows",
  },
  {
    id: "mistral/ministral-3b",
    name: "Ministral 3B",
    provider: "mistral",
    description: "Compact, ultra-low-latency edge model for lightweight and on-device tasks",
  },
];
