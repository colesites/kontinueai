import type { ModelOption } from "./models";

export const DEEPSEEK_MODELS: ModelOption[] = [
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "High-performance model for long-context reasoning and complex coding tasks",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    description: "Fast model for coding and everyday AI tasks",
  },
  {
    id: "deepseek/deepseek-v3.2-thinking",
    name: "DeepSeek V3.2 Thinking",
    provider: "deepseek",
    description: "Reasoning model for complex multi-step tasks",
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    description: "Efficient model for coding and general-purpose tasks",
  },
];
