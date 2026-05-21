import type { ModelOption } from "./models";

export const OPENAI_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-5.5-pro",
    name: "GPT 5.5 Pro",
    provider: "openai",
    description: "High-performance model for advanced reasoning, and coding",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
    provider: "openai",
    description: "Powerful, general-purpose model for coding, and research",
  },
  {
    id: "openai/gpt-5.4-pro",
    name: "GPT 5.4 Pro",
    provider: "openai",
    description: "Designed to tackle tough problems",
  },
  {
    id: "openai/gpt-5.4",
    name: "GPT 5.4",
    provider: "openai",
    description: "Fast, efficient model for everyday AI tasks",
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT 5.4 Mini",
    provider: "openai",
    description: "The strengths of GPT-5.4 to a faster, more efficient model",
  },
  {
    id: "openai/gpt-5.4-nano",
    name: "GPT 5.4 Nano",
    provider: "openai",
    description: "Designed for tasks where speed and cost matter most",
  },
  {
    id: "openai/gpt-5.3-chat",
    name: "GPT 5.3 Chat",
    provider: "openai",
    description: "OpenAI’s high-speed, natural conversational specialist",
  },
  {
    id: "openai/gpt-image-2",
    name: "GPT Image 2",
    provider: "openai",
    description: "Fast, high-quality image generation and editing",
  },
  {
    id: "openai/gpt-image-1.5",
    name: "GPT Image 1.5",
    provider: "openai",
    description: "Better instruction following and adherence to prompts",
  }
];
