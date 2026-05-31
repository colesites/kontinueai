// K-AI web-search pipeline orchestrator.
//
// Flow: cache lookup → daily quota → provider search (Tavily→Brave) → content
// processing → build prompt context → cache store. Returns a structured outcome
// the route injects into the prompt and surfaces as citations. Any failure
// degrades gracefully (returns null → the route answers model-only).

import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { isAnyProviderConfigured, searchWithFallback } from "./providers";
import type { WebSearchOutcome, WebSearchSource } from "./types";

const PER_SOURCE_CHARS = 1200;
const MAX_CONTEXT_CHARS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Stable, length-bounded cache key from a normalized query (djb2).
function queryKeyFor(query: string): string {
  const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return `q_${(hash >>> 0).toString(16)}`;
}

// Build the structured context block + citation list from a provider response.
function buildContext(
  answer: string | null | undefined,
  results: Array<{ title: string; url: string; content: string }>,
): { contextText: string; sources: WebSearchSource[] } {
  const sources: WebSearchSource[] = [];
  const lines: string[] = [];
  if (answer && answer.trim()) {
    lines.push(`Search synthesis: ${answer.trim()}`, "");
  }
  let total = lines.join("\n").length;
  results.forEach((r, i) => {
    const idx = i + 1;
    const snippet = r.content.slice(0, PER_SOURCE_CHARS).trim();
    const block = `[${idx}] ${r.title}\nURL: ${r.url}\n${snippet}`;
    if (total + block.length > MAX_CONTEXT_CHARS) return;
    lines.push(block, "");
    total += block.length;
    sources.push({ title: r.title, url: r.url, snippet: snippet.slice(0, 300) });
  });
  return { contextText: lines.join("\n").trim(), sources };
}

export interface RunWebSearchArgs {
  query: string;
  convexToken: string;
}

export type RunWebSearchResult =
  | (WebSearchOutcome & { limited?: false })
  | { limited: true } // daily quota exhausted
  | null; // no providers / no results / error

export async function runKaiWebSearch({
  query,
  convexToken,
}: RunWebSearchArgs): Promise<RunWebSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (!isAnyProviderConfigured()) return null;

  const queryKey = queryKeyFor(trimmed);

  // 1) Cache hit — free, no quota consumed.
  try {
    const cached = await fetchQuery(
      convexApi.webSearch.getCached,
      { queryKey },
      { token: convexToken },
    );
    if (cached) {
      return {
        contextText: cached.contextText,
        sources: cached.sources,
        provider: cached.provider,
        cached: true,
      };
    }
  } catch (error) {
    console.error("[web-search] cache read failed", error);
  }

  // 2) Daily quota (free users: 10/day). Only consumed on a real provider hit.
  try {
    const quota = await fetchMutation(
      convexApi.webSearch.consumeSearchQuota,
      {},
      { token: convexToken },
    );
    if (!quota.allowed) return { limited: true };
  } catch (error) {
    console.error("[web-search] quota check failed", error);
    return null;
  }

  // 3) Provider search with fallback.
  const response = await searchWithFallback(trimmed);
  if (!response) return null;

  // 4) Process + build context.
  const { contextText, sources } = buildContext(response.answer, response.results);
  if (!contextText) return null;

  // 5) Cache store (best-effort).
  try {
    await fetchMutation(
      convexApi.webSearch.store,
      {
        queryKey,
        query: trimmed,
        contextText,
        sources,
        provider: response.provider,
        ttlMs: CACHE_TTL_MS,
      },
      { token: convexToken },
    );
  } catch (error) {
    console.error("[web-search] cache store failed", error);
  }

  return { contextText, sources, provider: response.provider, cached: false };
}
