import type { ModelOption } from "./models";

export const XAI_MODELS: ModelOption[] = [
    {
        id: "spacexai/grok-4.6",
        name: "Grok 4.6",
        provider: "xai",
        description: "Builds on Grok 4.5 for long-running agents and visual work",
    },
    {
        id: "spacexai/grok-4.3",
        name: "Grok 4.3",
        provider: "xai",
        description: "Grok 4.3 is a new model matching the scale of Grok 4.20",
    },
    {
        id: "spacexai/grok-4.20-multi-agent",
        name: "Grok 4.20 Multi-Agent",
        provider: "xai",
        description: "Multiple agents collaborate in parallel to perform deep research tasks",
    },
    {
        id: "spacexai/grok-4.20-reasoning",
        name: "Grok 4.20 Reasoning",
        provider: "xai",
        description: "Speed and agentic tool calling capabilities",
    },
    {
        id: "spacexai/grok-4.20-non-reasoning",
        name: "Grok 4.20 Non-Reasoning",
        provider: "xai",
        description: "Faster than the reasoning version",
    }
]
