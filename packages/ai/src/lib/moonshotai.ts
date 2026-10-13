import type { ModelOption } from "./models";

export const MOONSHOTAI_MODELS: ModelOption[] = [
    {
        id: "moonshotai/kimi-k3",
        name: "Kimi K3",
        provider: "moonshotai",
        description: "Kimi's latest flagship model with a 1M context window for long-horizon coding and knowledge work",
    },
    {
        id: "moonshotai/kimi-k3-fast",
        name: "Kimi K3 Fast",
        provider: "moonshotai",
        description: "High-speed edition of Kimi K3 for rapid agentic execution",
    },
    {
        id: "moonshotai/kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        provider: "moonshotai",
        description: "Specialized coding model with upgraded agent capabilities and deep reasoning",
    },
    {
        id: "moonshotai/kimi-k2.7-code-highspeed",
        name: "Kimi K2.7 Code High Speed",
        provider: "moonshotai",
        description: "High-speed variant of Kimi K2.7 Code for faster turnaround",
    },
    {
        id: "moonshotai/kimi-k2.6",
        name: "Kimi K2.6",
        provider: "moonshotai",
        description: "Strong performance in long-horizon coding tasks",
    },
    {
        id: "moonshotai/kimi-k2.5",
        name: "Kimi K2.5",
        provider: "moonshotai",
        description: "Native multimodal model supporting unified visual and text reasoning",
    },
    {
        id: "moonshotai/kimi-k2-thinking",
        name: "Kimi K2 Thinking",
        provider: "moonshotai",
        description: "Built as a thinking agent",
    },
];
