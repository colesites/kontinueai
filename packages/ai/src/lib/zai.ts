import type { ModelOption } from "./models";

export const ZAI_MODELS: ModelOption[] = [
  {
    id: "zai/glm-5.3",
    name: "GLM 5.3",
    provider: "zai",
    description: "Zhipu AI's latest flagship model with advanced software engineering and agent capabilities",
  },
  {
    id: "zai/glm-5.3-fast",
    name: "GLM 5.3 Fast",
    provider: "zai",
    description: "Speed-optimized edition of GLM 5.3 for responsive real-time agent workloads",
  },
  {
    id: "zai/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    provider: "zai",
    description: "Native multimodal coding model with 320B total and 18B active parameters",
  },
  {
    id: "zai/glm-5.3-flashx",
    name: "GLM 5.3 FlashX",
    provider: "zai",
    description: "Ultra high-throughput serving edition of GLM 5.3 Flash",
  },
  {
    id: "zai/glm-5.2",
    name: "GLM 5.2",
    provider: "zai",
    description: "Agentic coding and reasoning",
  },
  {
    id: "zai/glm-5.2-fast",
    name: "GLM 5.2 Fast",
    provider: "zai",
    description: "High-speed variant of GLM 5.2 with 1M context window",
  },
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
    description: "Frontier foundation model optimized for complex systems engineering",
  },
  {
    id: "zai/glm-4.7",
    name: "GLM 4.7",
    provider: "zai",
    description: "Specialized model for multilingual agentic coding and terminal tasks",
  },
];
