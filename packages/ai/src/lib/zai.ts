import type { ModelOption } from "./models";

export const ZAI_MODELS: ModelOption[] = [
  {
    id: "zai/glm-5.1",
    name: "GLM 5.1",
    provider: "zai",
    description: "Autonomous long-horizon coder",
  },
  {
    id: "zai/glm-5v-turbo",
    name: "GLM 5V Turbo",
    provider: "zai",
    description: "Multimodal agentic coder",
  },
  {
    id: "zai/glm-5-turbo",
    name: "GLM 5 Turbo",
    provider: "zai",
    description: "Optimized agentic engine",
  },
  {
    id: "zai/glm-5",
    name: "GLM 5",
    provider: "zai",
    description: "Flagship engineering agent",
  },
];
