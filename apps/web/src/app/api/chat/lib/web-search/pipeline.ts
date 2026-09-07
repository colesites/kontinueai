// K-AI web-search pipeline orchestrator.
//
// Flow: cache lookup → monthly quota → provider search (Tavily→Brave) → content
// processing → build prompt context → cache store. Returns a structured outcome
// the route injects into the prompt and surfaces as citations. Any failure
// degrades gracefully (returns null → the route answers model-only).

import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { WebSearchTrigger } from "./policy";
import { isAnyProviderConfigured, searchWithFallback } from "./providers";
import type { WebSearchOutcome, WebSearchSource } from "./types";

// Mirrors the union returned by `webSearch.consumeSearchQuota`.
type SearchQuotaReason =
	| "ok"
	| "unauthenticated"
	| "monthly_limit"
	| "credits_exhausted";

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
//
// The budget is shared EVENLY across results rather than first-come-first-served.
// The old loop filled each source to PER_SOURCE_CHARS until the cap ran out,
// which always starved the last source — and the last source is regularly the
// one carrying the answer. (Real case: "chelsea next epl match" put the only
// result containing the actual next fixture in position 5, where it was dropped
// entirely, leaving the model four sources that could not answer the question.)
export function buildContext(
	answer: string | null | undefined,
	results: Array<{ title: string; url: string; content: string }>,
): { contextText: string; sources: WebSearchSource[] } {
	const sources: WebSearchSource[] = [];
	const lines: string[] = [];

	// A provider's own synthesized answer is a hint, not the answer. Tavily's is
	// frequently wrong on "next X" questions — it reads the first row of a
	// fixture/schedule table without checking it is still in the future — and a
	// smaller model will repeat it verbatim if we present it as settled fact.
	if (answer?.trim()) {
		lines.push(
			`Unverified provider summary (often wrong about dates and "next"/"latest" questions — check it against the numbered sources below and against the current date, and trust the sources when they disagree): ${answer.trim()}`,
			"",
		);
	}

	const headroom = MAX_CONTEXT_CHARS - lines.join("\n").length;
	// Reserve the title + URL lines for each result before splitting the rest of
	// the budget between them.
	const overhead = results.reduce(
		(sum, r) => sum + r.title.length + r.url.length + 16,
		0,
	);
	const perSource =
		results.length > 0
			? Math.max(
					200,
					Math.min(
						PER_SOURCE_CHARS,
						Math.floor((headroom - overhead) / results.length),
					),
				)
			: 0;

	results.forEach((r, i) => {
		const idx = i + 1;
		const snippet = r.content.slice(0, perSource).trim();
		lines.push(`[${idx}] ${r.title}\nURL: ${r.url}\n${snippet}`, "");
		sources.push({
			title: r.title,
			url: r.url,
			snippet: snippet.slice(0, 300),
		});
	});
	return { contextText: lines.join("\n").trim(), sources };
}

export interface RunWebSearchArgs {
	query: string;
	convexToken: string;
	// Whether the user asked for this search (toggle on) or we decided the query
	// needed live data. Both are charged the same; this is telemetry only.
	trigger?: WebSearchTrigger;
}

export type RunWebSearchResult =
	| (WebSearchOutcome & { limited?: false })
	| { limited: true; reason: SearchQuotaReason } // quota / credits exhausted
	| null; // no providers / no results / error

export async function runKaiWebSearch({
	query,
	convexToken,
	trigger = "manual",
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

	// 2) Monthly quota. Consumed only on a real provider hit — a cache hit above
	// is free — and consumed the same whether the search was asked for or
	// auto-triggered, so an auto search can never slip past the counter.
	try {
		const quota = await fetchMutation(
			convexApi.webSearch.consumeSearchQuota,
			{ source: trigger },
			{ token: convexToken },
		);
		if (!quota.allowed) {
			return { limited: true, reason: quota.reason };
		}
	} catch (error) {
		console.error("[web-search] quota check failed", error);
		return null;
	}

	// 3) Provider search with fallback.
	const response = await searchWithFallback(trimmed);
	if (!response) return null;

	// 4) Process + build context.
	const { contextText, sources } = buildContext(
		response.answer,
		response.results,
	);
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
