// Docs ingestion. Fetches official documentation, converts to text, splits into
// chunks, and tags each chunk with metadata for version-aware, citable retrieval.
//
// Environment-agnostic: uses the global `fetch`, returns plain data. Persistence
// is the caller's job (write to disk via Tauri fs, or upsert into Convex).

import sourcesData from "./sources.json";

export type DocSource = {
  framework: string;
  version?: string;
  url: string;
  kind: "site" | "page" | "markdown" | "repo";
  refreshDays?: number;
};

export type DocChunk = {
  id: string;
  framework: string;
  version: string;
  sourceUrl: string;
  title: string;
  content: string;
  lastIndexed: string; // ISO timestamp
};

export function loadDocSources(): DocSource[] {
  return (sourcesData as { sources: DocSource[] }).sources;
}

// Crude HTML → text: drop scripts/styles, strip tags, collapse whitespace. Good
// enough for keyword retrieval; a v2 could use a real readability extractor.
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.trim() || fallback;
}

// Split text into ~`size`-char chunks with `overlap` carry-over, breaking on
// word boundaries so chunks stay readable.
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  if (text.length <= size) return text.length ? [text] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + size * 0.6) end = lastSpace;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}

// Fetches a URL and returns the body text. Defaults to global fetch (Node/web);
// the Tauri IDE passes a Rust-backed fetcher to avoid renderer CORS limits.
export type DocFetcher = (url: string) => Promise<string>;

const defaultFetcher: DocFetcher = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "KodeIDE-DocsIndexer" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
};

/** Fetch a single source and turn it into metadata-tagged chunks. */
export async function indexSource(
  source: DocSource,
  fetcher: DocFetcher = defaultFetcher,
): Promise<DocChunk[]> {
  const body = await fetcher(source.url);
  const isHtml = /<html[\s>]/i.test(body) || source.kind === "site" || source.kind === "page";
  const title = isHtml ? extractTitle(body, source.framework) : source.framework;
  const text = isHtml ? htmlToText(body) : body;
  const now = new Date().toISOString();
  const version = source.version ?? "latest";

  return chunkText(text).map((content, i) => ({
    id: `${source.framework}@${version}#${i}`,
    framework: source.framework,
    version,
    sourceUrl: source.url,
    title,
    content,
    lastIndexed: now,
  }));
}

/** Index every configured source. Failures are skipped (logged), not fatal. */
export async function indexAllSources(
  sources: DocSource[] = loadDocSources(),
  fetcher: DocFetcher = defaultFetcher,
): Promise<DocChunk[]> {
  const results = await Promise.allSettled(
    sources.map((source) => indexSource(source, fetcher)),
  );
  const chunks: DocChunk[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") chunks.push(...result.value);
    else console.warn(`[docs] index failed: ${String(result.reason)}`);
  }
  return chunks;
}

/** Which sources are stale and due for a refresh, given previously indexed times. */
export function sourcesDueForRefresh(
  sources: DocSource[],
  lastIndexedByFramework: Record<string, string>,
): DocSource[] {
  const now = Date.now();
  return sources.filter((source) => {
    const last = lastIndexedByFramework[source.framework];
    if (!last) return true;
    const ageDays = (now - new Date(last).getTime()) / 86_400_000;
    return ageDays >= (source.refreshDays ?? 30);
  });
}
