export type ImportStrategy = "scraper" | "firecrawl";

// TEMP KILL-SWITCH: the self-hosted scraper OOMs (Chromium > 512MB) on the
// current Render Starter plan, crashing the process (502s). Until it's moved to
// a larger instance, route ALL imports through Firecrawl (hosted — no memory
// limit on our side). The scraper code + host list below are kept intact; flip
// this back to `true` once the scraper has more RAM.
const SCRAPER_ENABLED = false;

// Hosts the self-hosted Kontinue scraper can extract directly (work headless on
// a datacenter IP). Everything else falls through to Firecrawl.
const SCRAPER_HOST_PATTERNS: RegExp[] = [
  /(^|\.)chatgpt\.com$/,
  /(^|\.)chat\.openai\.com$/,
  /(^|\.)gemini\.google\.com$/,
  /(^|\.)g\.co$/,
  /(^|\.)grok\.com$/,
  /(^|\.)x\.com$/,
  /(^|\.)qwen\.ai$/,
  /(^|\.)tongyi\.aliyun\.com$/,
  /(^|\.)deepseek\.com$/,
  /(^|\.)kimi\.com$/,
  /(^|\.)kimi\.moonshot\.cn$/,
  /(^|\.)meta\.ai$/,
  /(^|\.)manus\.(ai|im)$/,
];

// Anti-bot walled platforms (Cloudflare Turnstile, Vercel checkpoint, join-only
// flows) that the scraper can't clear from a datacenter IP — route to Firecrawl:
// Claude, T3Chat, Perplexity, Copilot. Unknown hosts also default to Firecrawl
// since it's the generic fallback extractor.
export function getImportStrategy(url: string): ImportStrategy {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "firecrawl";
  }

  if (SCRAPER_ENABLED && SCRAPER_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return "scraper";
  }

  return "firecrawl";
}
