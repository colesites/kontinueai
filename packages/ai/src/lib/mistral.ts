import type { ModelOption } from "./models";

export const MISTRAL_MODELS: ModelOption[] = [
  {
    id: "mistral/devstral-2",
    name: "Devstral 2",
    provider: "mistral",
    description: "Enterprise-grade text model",
  },
  {
    id: "mistral/mistral-large-3",
    name: "Mistral Large 3",
    provider: "mistral",
    description: "Flagship multimodal model",
  },
  {
    id: "mistral/ministral-14b",
    name: "Ministral 14B",
    provider: "mistral",
    description: "Multimodal edge powerhouse",
  }
];
