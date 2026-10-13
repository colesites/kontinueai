import type { ModelOption } from "./models";

export const XAI_MODELS: ModelOption[] = [
    {
        id: "spacexai/grok-voice-think-fast-2.0",
        name: "Grok Voice Think Fast 2.0",
        provider: "xai",
        description: "Realtime low-latency voice model with fast reasoning",
        modality: "realtime",
    },
    {
        id: "spacexai/grok-4.7",
        name: "Grok 4.7",
        provider: "xai",
        description: "xAI's latest flagship model with enhanced reasoning, tool calling, and agentic capabilities",
    },
    {
        id: "spacexai/grok-4.6",
        name: "Grok 4.6",
        provider: "xai",
        description: "Builds on Grok 4.5 for long-running agents and visual work",
    },
    {
        id: "spacexai/grok-4.5",
        name: "Grok 4.5",
        provider: "xai",
        description: "Frontier reasoning model for complex visual understanding and long-horizon tasks",
    },
    {
        id: "spacexai/grok-4.3",
        name: "Grok 4.3",
        provider: "xai",
        description: "Grok 4.3 is a new model matching the scale of Grok 4.20",
    },
    {
        id: "spacexai/grok-4.1-fast-reasoning",
        name: "Grok 4.1 Fast Reasoning",
        provider: "xai",
        description: "High-speed reasoning model with native tool-calling and structured outputs",
    },
    {
        id: "spacexai/grok-build-0.1",
        name: "Grok Build 0.1",
        provider: "xai",
        description: "Specialized agentic coding model optimized for real-time repository development",
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
    },
];
