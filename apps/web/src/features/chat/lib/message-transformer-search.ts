import type { UIMessage } from "ai";

export type SearchResultSummary = {
  title: string;
  url: string;
  snippet: string;
};

const SEARCH_RESULT_TITLE_HINTS: Array<[needle: string, summary: string]> = [
  ["stats", "Summarizes team and player statistics for the current season."],
  ["squad", "Lists squad members and appearance/position details."],
  ["ratings", "Covers player ratings and highlights top-rated players."],
  ["transfer", "Reports recent transfer activity and squad changes."],
];

const FALLBACK_ANALYSIS_EXCLUDED_NAMES = new Set([
  "Premier League",
  "Champions League",
  "Official Site",
  "Chelsea",
]);

function normalizeSnippet(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\{ts:\d+\}/g, " ")
    .replace(/\|[^\n]*\|/g, " ")
    .replace(/\b([A-Z]{1,4}\s?){4,}\b/g, " ")
    .replace(/#{1,6}\s*/g, " ")
    .replace(/\bGlossary\b[\s\S]*$/i, " ")
    .replace(/\.{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function summarizeFromTitle(title: string): string {
  const lower = title.toLowerCase();
  const found = SEARCH_RESULT_TITLE_HINTS.find(([needle]) =>
    lower.includes(needle),
  );
  if (found) return found[1];
  return "Provides relevant background information related to the query.";
}

function toDisplaySummary(title: string, snippet: string): string {
  if (!snippet) return summarizeFromTitle(title);
  const maxLen = 170;
  const sentences = snippet
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20);

  let candidate = sentences[0] ?? snippet;
  if (candidate.endsWith("?") && sentences.length > 1) {
    candidate = `${candidate} ${sentences[1]}`;
  }

  const compact = candidate.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen).trimEnd()}... (truncated)`;
}

function extractSnippetFromUnknown(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  const directCandidates = [
    source.snippet,
    source.summary,
    source.description,
    source.content,
    source.text,
    source.pageContent,
    source.page_content,
    source.markdown,
    source.extract,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const joined = candidate
        .filter((item): item is string => typeof item === "string")
        .join(" ");
      if (joined.trim()) return joined.trim();
    }
  }

  const nestedObjects = [source.output, source.data, source.attributes, source.metadata];
  for (const nested of nestedObjects) {
    const nestedSnippet = extractSnippetFromUnknown(nested);
    if (nestedSnippet) return nestedSnippet;
  }

  return "";
}

export function collectSearchResults(value: unknown): SearchResultSummary[] {
  const results = (value as { results?: Record<string, unknown>[] })?.results;
  if (!Array.isArray(results)) return [];

  const collected: SearchResultSummary[] = [];
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const url = (result.url as string)?.trim() || "";
    if (!url || collected.some((entry) => entry.url === url)) continue;

    const title = (result.title as string)?.trim() || url;
    const snippet = normalizeSnippet(extractSnippetFromUnknown(result));
    collected.push({ title, url, snippet: toDisplaySummary(title, snippet) });
  }

  return collected;
}

export function collectPerplexitySearchResults(
  parts: UIMessage["parts"],
): SearchResultSummary[] {
  const searchResults: SearchResultSummary[] = [];
  for (const part of parts) {
    if (part.type === "tool-perplexity_search" && "output" in part) {
      searchResults.push(...collectSearchResults(part.output));
      continue;
    }

    if (
      part.type === "tool-result" &&
      (part as { toolName?: string }).toolName === "perplexity_search"
    ) {
      const payload =
        (part as { output?: unknown; result?: unknown }).output ??
        (part as { output?: unknown; result?: unknown }).result;
      searchResults.push(...collectSearchResults(payload));
    }
  }
  return searchResults;
}

export function buildSearchFallbackContent(
  searchResults: SearchResultSummary[],
): string {
  if (searchResults.length === 0) return "";

  const nameRegex = /\b([A-Z][a-zA-ZÀ-ÿ'`-]+(?:\s+[A-Z][a-zA-ZÀ-ÿ'`-]+){1,2})\b/g;
  const counts = new Map<string, number>();

  for (const entry of searchResults) {
    const corpus = `${entry.title} ${entry.snippet}`;
    for (const match of corpus.matchAll(nameRegex)) {
      const name = match[1]?.trim();
      if (!name || name.length < 6 || FALLBACK_ANALYSIS_EXCLUDED_NAMES.has(name)) {
        continue;
      }
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const topNames = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const lines = searchResults.slice(0, 3).map((entry, index) => {
    return `${index + 1}. [${entry.title}](${entry.url})\n   ${entry.snippet || "View source"}`;
  });

  return [
    topNames.length > 0
      ? `Analysis results for ${topNames.join(", ")}.`
      : "I found relevant sources for your query.",
    "Top sources:",
    ...lines,
  ].join("\n");
}
