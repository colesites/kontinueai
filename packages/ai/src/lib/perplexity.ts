import type { ModelOption } from "./models";

export const PERPLEXITY_MODELS: ModelOption[] = [
  {
    id: "perplexity/sonar-reasoning-pro",
    name: "Sonar Reasoning Pro",
    provider: "perplexity",
    description: "Deep-search reasoning powerhouse",
  },
  {
    id: "perplexity/sonar-pro",
    name: "Sonar Pro",
    provider: "perplexity",
    description: "Search-grounded advanced reasoning",
  },
  {
    id: "perplexity/sonar",
    name: "Sonar",
    provider: "perplexity",
    description: "Fast, lightweight search",
  },
];
