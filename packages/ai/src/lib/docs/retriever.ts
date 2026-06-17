// Docs retrieval. Scores indexed chunks against a query (keyword + framework
// match) and returns the most relevant, plus a citable prompt block.
//
// v1 is keyword-based (BM25-lite) so it works with zero external dependencies and
// no embedding provider. The DocChunk shape already carries everything an
// embedding-based v2 would need (just add a `vector` field and swap `scoreChunk`).

import type { DocChunk } from "./indexer";

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it",
  "how", "do", "i", "with", "this", "that", "use", "using",
  // Greetings / conversational filler — these carry no doc intent, but words
  // like "hello" appear verbatim in code examples ("Hello world!") and would
  // otherwise pull in spurious citations on a plain "hi".
  "hello", "hi", "hey", "yo", "thanks", "thank", "thx", "please", "pls",
  "yes", "no", "yeah", "nah", "ok", "okay", "sure", "cool", "nice", "great",
  "you", "your", "you're", "me", "my", "we", "us", "can", "could", "would",
  "what", "whats", "who", "are", "am", "be", "hello!", "test", "testing",
]);

// A single incidental keyword match scores sqrt(1) = 1. Require more signal than
// that before a chunk is considered relevant enough to cite as a source.
const MIN_SCORE = 1.5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function scoreChunk(
  chunk: DocChunk,
  queryTokens: string[],
  framework?: string | null,
): number {
  const haystack = chunk.content.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    // Count occurrences with diminishing returns (sqrt) to avoid keyword spam.
    let count = 0;
    let idx = haystack.indexOf(token);
    while (idx !== -1 && count < 10) {
      count += 1;
      idx = haystack.indexOf(token, idx + token.length);
    }
    if (count > 0) score += Math.sqrt(count);
  }
  // Boost chunks from the framework the user is actually working in.
  if (framework && chunk.framework.toLowerCase() === framework.toLowerCase()) {
    score *= 1.5;
  }
  return score;
}

export type RetrieveOptions = {
  framework?: string | null;
  topK?: number;
};

export function retrieveDocs(
  query: string,
  chunks: DocChunk[],
  options: RetrieveOptions = {},
): DocChunk[] {
  const { framework, topK = 4 } = options;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  return chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens, framework) }))
    .filter((x) => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
}

/** Render retrieved chunks into a cite-able system-prompt block. */
export function buildDocsContext(chunks: DocChunk[]): string {
  if (chunks.length === 0) return "";
  const blocks = chunks.map(
    (c, i) =>
      `[${i + 1}] ${c.framework} ${c.version} — ${c.title} (${c.sourceUrl})\n${c.content}`,
  );
  return [
    "\n\nRETRIEVED DOCUMENTATION — ground your answer in these official docs and cite them as [n] with their URL when you rely on them:",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}
