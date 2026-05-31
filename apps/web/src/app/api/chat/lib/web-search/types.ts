// Shared types for the K-AI web-search pipeline.

export interface WebSearchSource {
  title: string;
  url: string;
  snippet?: string;
}

// A single normalized result from any provider.
export interface ProviderResult {
  title: string;
  url: string;
  content: string; // cleaned text/snippet the provider extracted
  score?: number;
}

export interface ProviderResponse {
  provider: string;
  results: ProviderResult[];
  // Optional provider-synthesized answer (e.g. Tavily's `answer`).
  answer?: string | null;
}

// Final output of the pipeline, ready to inject into the prompt + render.
export interface WebSearchOutcome {
  contextText: string;
  sources: WebSearchSource[];
  provider: string;
  cached: boolean;
}
