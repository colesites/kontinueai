export type ModelCapability =
  | "text"
  | "image-generation"
  | "implicit-caching"
  | "explicit-caching"
  | "web-search"
  | "thinking"
  | "embedding";

import type { AiGatewayModel } from "./model-pricing";

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

  const pricing = model.pricing ?? {};
  if (pricing && typeof pricing === "object") {
    if ("input_cache_write" in pricing) caps.add("explicit-caching");
    if ("input_cache_read" in pricing) {
      // This doesn't necessarily imply implicit caching, but it indicates cache reads are supported.
      // We'll still use the dedicated tag for implicit caching.
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
    // If we have stale data, return it rather than throwing
    if (_cachedModels) return _cachedModels;
    throw new Error(`Failed to fetch AI Gateway models: ${res.status}`);
  }
  const json = (await res.json()) as { data?: AiGatewayModel[] };
  _cachedModels = json.data ?? [];
  _cacheExpiry = now + CACHE_TTL_MS;
  return _cachedModels;
}
