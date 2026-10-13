export type ModelCapability =
  | "text"
  | "image-generation"
  | "implicit-caching"
  | "explicit-caching"
  | "web-search"
  | "thinking"
  | "embedding";

import type { AiGatewayModel } from "./model-pricing";

export function isReasoningModelId(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower === "kontinue/k-ai-1.0" ||
    lower.includes("reasoning") ||
    lower.includes("thinking") ||
    lower.includes("/o1") ||
    lower.includes("/o3") ||
    lower.includes("/o4-mini") ||
    lower.includes("-r1") ||
    lower.includes("qwq") ||
    lower.includes("claude-3-7-sonnet") ||
    lower.includes("claude-3.7-sonnet") ||
    lower.includes("gemini-2.5-pro") ||
    lower.includes("gemini-2.5-flash") ||
    lower.includes("gemini-4")
  );
}

export function deriveCapabilities(model: AiGatewayModel): ModelCapability[] {
  const caps = new Set<ModelCapability>();

  if (model.type === "language") caps.add("text");
  if (model.type === "embedding") caps.add("embedding");

  if (Array.isArray(model.tags)) {
    for (const tag of model.tags) {
      if (tag === "image-generation") caps.add("image-generation");
      if (tag === "implicit-caching") caps.add("implicit-caching");
      if (tag === "reasoning") caps.add("thinking");
    }
  }

  // Fallback pattern matching for models with native reasoning capabilities
  if (isReasoningModelId(model.id)) {
    caps.add("thinking");
  }

  const pricing = model.pricing ?? {};
  if (pricing && typeof pricing === "object") {
    if ("input_cache_write" in pricing) caps.add("explicit-caching");
    if ("input_cache_read" in pricing) {
      // Indicates cache reads are supported.
    }
    const webSearch = (pricing as Record<string, unknown>).web_search;
    if (
      webSearch !== undefined &&
      webSearch !== null &&
      String(webSearch) !== "0"
    ) {
      caps.add("web-search");
    }
    if ("image" in pricing || "image_output" in pricing) {
      caps.add("image-generation");
    }
  }

  return Array.from(caps);
}

// ── In-memory cache for gateway models (5-min TTL) ────────
const CACHE_TTL_MS = 5 * 60 * 1000;
let _cachedModels: AiGatewayModel[] | null = null;
let _cacheExpiry = 0;

export async function fetchAiGatewayModels(): Promise<AiGatewayModel[]> {
  const now = Date.now();
  if (_cachedModels && now < _cacheExpiry) {
    return _cachedModels;
  }

  const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.statusText}`);
  }

  const data = (await res.json()) as { data: AiGatewayModel[] };
  _cachedModels = data.data;
  _cacheExpiry = now + CACHE_TTL_MS;
  return _cachedModels;
}
