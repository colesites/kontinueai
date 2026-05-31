// Search-intent detection layer. Decides — without calling the model — whether a
// user query needs a live web search. Heuristic keyword scoring with a
// confidence value so the threshold is tunable.

export interface SearchDecision {
  shouldSearch: boolean;
  confidence: number; // 0..1
  reason: string;
}

// Strong recency / live-data signals.
const STRONG_SIGNALS = [
  "latest",
  "current",
  "today",
  "tonight",
  "right now",
  "recent",
  "recently",
  "this week",
  "this month",
  "this year",
  "breaking",
  "news",
  "update",
  "updates",
  "price",
  "stock",
  "crypto",
  "bitcoin",
  "ethereum",
  "weather",
  "forecast",
  "score",
  "scores",
  "fixture",
  "standings",
  "trending",
  "release date",
  "just launched",
  "announced",
  "who won",
  "what happened",
];

// Weaker signals — contribute, but not enough alone.
const WEAK_SIGNALS = [
  "now",
  "live",
  "schedule",
  "available",
  "version",
  "released",
  "launch",
  "happening",
];

// Signals the query is self-contained and should NOT trigger search.
const NEGATIVE_SIGNALS = [
  "write a",
  "write me",
  "code",
  "function",
  "algorithm",
  "regex",
  "debug",
  "refactor",
  "explain",
  "what does",
  "how do i",
  "how to",
  "translate",
  "summarize this",
  "rewrite",
  "fix this",
  "calculate",
  "solve",
  "prove",
  "define",
  "difference between",
];

function countMatches(text: string, terms: string[]): number {
  let n = 0;
  for (const t of terms) if (text.includes(t)) n++;
  return n;
}

export interface SearchIntentOptions {
  // When true (e.g. the Research/Marketing agents), bias toward searching:
  // lower the trigger threshold and add a baseline boost so borderline queries
  // still search. Clearly self-contained queries (negative signals) are still
  // suppressed.
  aggressive?: boolean;
}

export function detectSearchIntent(
  rawQuery: string,
  options: SearchIntentOptions = {},
): SearchDecision {
  const query = rawQuery.toLowerCase().trim();
  if (!query) {
    return { shouldSearch: false, confidence: 0, reason: "empty query" };
  }

  // Explicit user opt-in always searches.
  if (/\bsearch (the )?(web|internet|online)\b|\bgoogle\b|\blook up\b/.test(query)) {
    return { shouldSearch: true, confidence: 0.95, reason: "explicit search request" };
  }

  const strong = countMatches(query, STRONG_SIGNALS);
  const weak = countMatches(query, WEAK_SIGNALS);
  const negative = countMatches(query, NEGATIVE_SIGNALS);

  // A 4-digit year >= current year is a recency hint.
  const yearHint = /\b20(2[6-9]|[3-9]\d)\b/.test(query) ? 1 : 0;

  // Aggressive mode (research/marketing agents) adds a baseline so neutral
  // queries lean toward searching, but negative signals still pull it down.
  const baseline = options.aggressive ? 0.4 : 0;
  const score =
    baseline + strong * 0.45 + weak * 0.2 + yearHint * 0.3 - negative * 0.5;
  // Clamp to 0..1.
  const confidence = Math.max(0, Math.min(1, score));

  // Lower the bar in aggressive mode.
  const threshold = options.aggressive ? 0.3 : 0.45;
  const shouldSearch = confidence >= threshold;
  return {
    shouldSearch,
    confidence,
    reason: shouldSearch
      ? `recency signals (strong=${strong}, weak=${weak}, year=${yearHint}${options.aggressive ? ", agent-auto" : ""})`
      : negative > 0
        ? "self-contained query (negative signals)"
        : "no strong recency signals",
  };
}
