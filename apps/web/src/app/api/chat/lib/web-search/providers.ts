// Search-provider abstraction. Each provider returns a normalized
// ProviderResponse so the pipeline is provider-agnostic. Add Serper/Exa/etc.
// by implementing the same shape and registering them in PROVIDER_CHAIN.

import type { ProviderResponse, ProviderResult } from "./types";

const MAX_RESULTS = 5;
const PROVIDER_TIMEOUT_MS = 8000;

// fetch with a hard timeout so a slow provider can't stall the whole chat.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Tavily (primary) ──────────────────────────────────────────────────────────
// Purpose-built for LLM retrieval: returns cleaned `content` per result plus an
// optional synthesized `answer`, so we skip a separate extraction step.
async function tavilySearch(query: string): Promise<ProviderResponse | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetchWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: MAX_RESULTS,
      }),
    });
    if (!res.ok) {
      console.error("[web-search] tavily error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };
    const results: ProviderResult[] = (data.results ?? [])
      .filter((r) => r.url)
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: r.title ?? r.url ?? "Untitled",
        url: r.url!,
        content: (r.content ?? "").trim(),
        score: r.score,
      }));
    if (results.length === 0 && !data.answer) return null;
    return { provider: "tavily", results, answer: data.answer ?? null };
  } catch (error) {
    console.error("[web-search] tavily threw", error);
    return null;
  }
}

// ── Serper (fallback) ─────────────────────────────────────────────────────────
// Google results via Serper. Returns title/link/snippet (and sometimes an
// `answerBox`), which we map to our normalized shape.
async function serperSearch(query: string): Promise<ProviderResponse | null> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetchWithTimeout("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: MAX_RESULTS }),
    });
    if (!res.ok) {
      console.error("[web-search] serper error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      answerBox?: { answer?: string; snippet?: string };
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    const results: ProviderResult[] = (data.organic ?? [])
      .filter((r) => r.link)
      .slice(0, MAX_RESULTS)
      .map((r) => ({
        title: r.title ?? r.link ?? "Untitled",
        url: r.link!,
        content: (r.snippet ?? "").trim(),
      }));
    const answer = data.answerBox?.answer ?? data.answerBox?.snippet ?? null;
    if (results.length === 0 && !answer) return null;
    return { provider: "serper", results, answer };
  } catch (error) {
    console.error("[web-search] serper threw", error);
    return null;
  }
}

// Ordered chain — first provider that returns usable results wins.
const PROVIDER_CHAIN: Array<(q: string) => Promise<ProviderResponse | null>> = [
  tavilySearch,
  serperSearch,
];

export function isAnyProviderConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY);
}

// Try each provider in order until one yields results. Failures (missing key,
// timeout, error) fall through to the next provider transparently.
export async function searchWithFallback(
  query: string,
): Promise<ProviderResponse | null> {
  for (const provider of PROVIDER_CHAIN) {
    const out = await provider(query);
    if (out && (out.results.length > 0 || out.answer)) return out;
  }
  return null;
}
