import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { browserManager } from "./scraper/browser";
import { detectPlatform, UnsupportedPlatformError, SUPPORTED_PLATFORMS } from "./scraper/detect";
import { extractChatGPT } from "./scraper/extractors/chatgpt";
import { extractClaude } from "./scraper/extractors/claude";
import { extractGemini } from "./scraper/extractors/gemini";
import { extractGeminiCheerio } from "./scraper/extractors/geminiCheerio";
import { extractPerplexity } from "./scraper/extractors/perplexity";
import { extractT3Chat } from "./scraper/extractors/t3chat";
import { extractDeepSeek } from "./scraper/extractors/deepseek";
import { extractCopilot } from "./scraper/extractors/copilot";
import { extractQwen } from "./scraper/extractors/qwen";
import { extractManus } from "./scraper/extractors/manus";
import { extractGrok } from "./scraper/extractors/grok";
import { extractKimi } from "./scraper/extractors/kimi";
import { extractMetaAI } from "./scraper/extractors/metaai";
import { normalizeMessages } from "./scraper/normalize";
import { withRetry } from "./scraper/retry";
import type { ScrapeResult, Platform, IngestRequest, RawMessage } from "./types";

const ALLOWED_ORIGINS = (Bun.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const CHEERIO_PLATFORMS: Platform[] = ["gemini"];

const PLAYWRIGHT_EXTRACTORS: Record<Platform, (page: any) => Promise<any>> = {
  chatgpt: extractChatGPT,
  claude: extractClaude,
  gemini: extractGemini,
  perplexity: extractPerplexity,
  t3chat: extractT3Chat,
  deepseek: extractDeepSeek,
  copilot: extractCopilot,
  qwen: extractQwen,
  manus: extractManus,
  grok: extractGrok,
  kimi: extractKimi,
  metaai: extractMetaAI,
};

const app = new Hono();
const PLATFORM_TIMEOUT_MS: Partial<Record<Platform, number>> = {
  claude: 65000,
  gemini: 30000,
};

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key", "Origin"],
    maxAge: 86400,
  })
);

app.get("/health", (c) => {
  return c.json({ status: "ok", uptime: process.uptime() });
});

app.use("*", authMiddleware);
app.use("*", rateLimitMiddleware);

app.post("/v1/scrape", async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as { url?: unknown; formats?: unknown } | null;

    if (!body || typeof body.url !== "string") {
      return c.json({ success: false, error: "Invalid request body. Expected { url: string }" }, 400);
    }

    const headers = new Headers(c.req.raw.headers);
    headers.set("Content-Type", "application/json");

    const scrapeResponse = await app.fetch(
      new Request(new URL("/scrape-chat", c.req.url), {
        method: "POST",
        headers,
        body: JSON.stringify({ url: body.url }),
      }),
    );

    const result = await scrapeResponse.json() as Partial<ScrapeResult> & {
      error?: string;
      message?: string;
    };

    if (!scrapeResponse.ok) {
      return c.json(
        {
          success: false,
          error: result.error ?? "scrape_failed",
          message: result.message,
        },
        scrapeResponse.status as 400 | 401 | 403 | 408 | 422 | 429 | 500 | 503,
      );
    }

    const requestedFormats = Array.isArray(body.formats)
      ? body.formats.filter((format): format is string => typeof format === "string")
      : ["markdown"];
    const markdown = messagesToMarkdown(result.messages ?? []);

    return c.json({
      success: true,
      data: {
        markdown: requestedFormats.includes("markdown") ? markdown : undefined,
        metadata: {
          title: result.title ?? "Shared Chat",
          provider: result.site,
          scrapedAt: result.scrapedAt,
        },
        title: result.title ?? "Shared Chat",
        provider: result.site,
        messages: result.messages ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: "Internal server error", message: isDev() ? message : undefined }, 500);
  }
});

app.post("/ingest-chat", async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as IngestRequest | null;

    if (!body || typeof body.url !== "string" || typeof body.site !== "string" || !Array.isArray(body.messages)) {
      return c.json({ error: "Invalid request body. Expected { url, site, title?, messages[] }" }, 400);
    }

    if (!SUPPORTED_PLATFORMS.includes(body.site)) {
      return c.json({ error: "unsupported_platform", supported: SUPPORTED_PLATFORMS }, 400);
    }

    const rawMessages = sanitizeIngestedMessages(body.messages);
    if (rawMessages.length === 0) {
      return c.json({ error: "No messages found in ingested payload" }, 400);
    }

    const result: ScrapeResult = {
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Shared Chat",
      site: body.site,
      messages: normalizeMessages(rawMessages),
      scrapedAt: new Date().toISOString(),
    };

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Internal server error", message: isDev() ? message : undefined }, 500);
  }
});

app.post("/scrape-chat", async (c) => {
  let page: any;

  try {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body.url !== "string") {
      return c.json({ error: "Invalid request body. Expected { url: string }" }, 400);
    }

    const url = body.url;

    try {
      new URL(url);
    } catch {
      return c.json({ error: "Invalid URL format" }, 400);
    }

    let platform: Platform;
    try {
      platform = detectPlatform(url);
    } catch (err) {
      if (err instanceof UnsupportedPlatformError) {
        return c.json(
          {
            error: "unsupported_platform",
            message: "This URL is not from a supported platform.",
            supported: SUPPORTED_PLATFORMS,
          },
          400
        );
      }
      throw err;
    }

    let messages: any[] = [];
    let title = "Shared Chat";
    let skippedCount = 0;

    if (CHEERIO_PLATFORMS.includes(platform)) {
      try {
        // Use raw HTTP + Cheerio — no browser, no cookie dialogs
        const html = await withRetry(async () => {
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.text();
        }, 3);

        if (isDev()) {
          console.log(`[cheerio] Fetched ${html.length} bytes for ${platform}`);
          // Log first 500 chars for debugging
          console.log(`[cheerio] Preview: ${html.substring(0, 500)}`);
        }

        if (platform === "gemini") {
          const result = await extractGeminiCheerio(html);
          messages = result.messages;
          skippedCount = result.skippedCount;
          if (isDev()) console.log(`[gemini] Extracted ${messages.length} messages via cheerio`);
        }

        // Extract title from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();
      } catch (err) {
        if (isDev()) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[cheerio] ${platform} extraction failed, falling back to Playwright: ${message}`);
        }
      }

      // Shared pages sometimes change HTML role markers or return auth walls.
      if (shouldFallbackToPlaywright(platform, messages)) {
        page = await browserManager.acquirePage();

        const extractResult = await withRetry(
          () => withTimeout(runPlaywrightExtractor(page, url, platform), getPlatformTimeout(platform), `${platform}_timeout`),
          getPlatformRetries(platform)
        );

        messages = extractResult.messages;
        skippedCount = extractResult.skippedCount;
        title = await page.title().catch(() => title);

        if (isDev()) {
          console.log(`[playwright-fallback] ${platform} extracted ${messages.length} messages`);
        }
      }

    } else {
      // Use Playwright for platforms that need JS rendering
      page = await browserManager.acquirePage();

      const extractResult = await withRetry(
        () => withTimeout(runPlaywrightExtractor(page, url, platform), getPlatformTimeout(platform), `${platform}_timeout`),
        getPlatformRetries(platform)
      );

      messages = extractResult.messages;
      skippedCount = extractResult.skippedCount;
      title = await page.title().catch(() => "Shared Chat");
    }

    const normalizedMessages = normalizeMessages(messages);
    if (normalizedMessages.length === 0) {
      return c.json(
        {
          error: "no_messages_found",
          message:
            "Fetched the page, but could not find shared chat messages. The link may be deleted, private, blocked, or require a trusted browser session.",
        },
        422,
      );
    }

    const result: ScrapeResult = {
      title,
      site: platform,
      messages: normalizedMessages,
      scrapedAt: new Date().toISOString(),
    };

    if (isDev()) {
      (result as any).debug = {
        lowConfidenceNodes: 0,
        skippedNodes: skippedCount,
      };
    }

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("claude_security_verification_blocked")) {
      return c.json(
        {
          error: "claude_verification_required",
          message:
            "Claude is requiring Cloudflare verification from this browser session. Use a trusted Chrome profile or CDP-connected browser session for Claude scraping.",
        },
        503
      );
    }

    if (message.includes("timeout") || message.includes("Timeout")) {
      return c.json({ error: "Scrape timed out", message: isDev() ? message : undefined }, 408);
    }

    console.error("[scrape-chat] Error:", message);
    return c.json({ error: "Internal server error", message: isDev() ? message : undefined }, 500);
  } finally {
    if (page) {
      try {
        await browserManager.releasePage(page);
      } catch {
        // ignore
      }
    }
  }
});

function isDev(): boolean {
  return Bun.env.NODE_ENV !== "production";
}

function messagesToMarkdown(messages: ScrapeResult["messages"]): string {
  return messages
    .map((message) => {
      const label = message.role === "user" ? "[USER]:" : "[ASSISTANT]:";
      if (message.type === "code") {
        return `${label}\n\`\`\`${message.language ?? ""}\n${message.content ?? ""}\n\`\`\``;
      }
      if (message.type === "image" && message.url) {
        return `${label}\n![](${message.url})`;
      }
      if (message.type === "file" && message.url) {
        return `${label}\n[file](${message.url})`;
      }
      return `${label}\n${message.content ?? ""}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function sanitizeIngestedMessages(messages: unknown[]): RawMessage[] {
  const out: RawMessage[] = [];

  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const msg = item as Partial<RawMessage>;
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const content = typeof msg.content === "string" ? msg.content : "";
    const images = Array.isArray(msg.images) ? msg.images.filter((x): x is string => typeof x === "string") : [];
    const files = Array.isArray(msg.files) ? msg.files.filter((x): x is string => typeof x === "string") : [];
    const codes = Array.isArray(msg.codes)
      ? msg.codes
          .filter((x) => !!x && typeof x === "object")
          .map((code) => ({
            language: typeof (code as { language?: unknown }).language === "string" ? (code as { language: string }).language : "text",
            code: typeof (code as { code?: unknown }).code === "string" ? (code as { code: string }).code : "",
          }))
          .filter((code) => code.code.trim().length > 0)
      : [];

    if (content.trim().length === 0 && images.length === 0 && files.length === 0 && codes.length === 0) continue;

    out.push({
      role: msg.role,
      content,
      images,
      files,
      codes,
    });
  }

  return out;
}

function getPlatformTimeout(platform: Platform): number {
  return PLATFORM_TIMEOUT_MS[platform] ?? 30000;
}

// Claude is behind Cloudflare; repeated rapid retries escalate the challenge and
// make blocking worse, so we don't retry it.
function getPlatformRetries(platform: Platform): number {
  return platform === "claude" ? 1 : 3;
}

function shouldFallbackToPlaywright(platform: Platform, messages: Array<{ content?: string; role?: string }>): boolean {
  if (messages.length === 0) return true;

  if (platform === "gemini") {
    const hasAssistant = messages.some((m) => m.role === "assistant");
    if (!hasAssistant) return true;

    const joined = messages.map((m) => (m.content ?? "").toLowerCase()).join("\n");
    const markers = [
      "sign in",
      "accounts.google.com",
      "googletagmanager.com/ns.html",
      "google privacy policy",
      "google terms of service",
    ];

    let hits = 0;
    for (const marker of markers) {
      if (joined.includes(marker)) hits++;
    }
    if (hits >= 2 || joined.startsWith("sign in")) return true;
  }

  if (platform === "claude") {
    const hasAssistant = messages.some((m) => m.role === "assistant" && (m.content ?? "").trim().length > 0);
    if (!hasAssistant) return true;

    const joined = messages.map((m) => (m.content ?? "").toLowerCase()).join("\n");
    const markers = [
      "sign in",
      "privacy policy",
      "terms of service",
      "start your own conversation",
      "checking your browser",
      "just a moment",
      "security verification",
      "cloudflare",
    ];

    let hits = 0;
    for (const marker of markers) {
      if (joined.includes(marker)) hits++;
    }
    if (hits >= 2) return true;
  }

  return false;
}

async function runPlaywrightExtractor(page: any, url: string, platform: Platform): Promise<any> {
  if (platform === "claude") {
    await applyClaudeSessionCookies(page);
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (platform === "claude") {
    // Real Chrome clears the Cloudflare interstitial on its own; just wait for
    // the conversation to render. If it never does, the session was blocked.
    const appeared = await page
      .waitForSelector(
        '[data-test-render-count], [data-testid="user-message"], .font-claude-response',
        { timeout: 40000 },
      )
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      const html = await page.content().catch(() => "");
      if (looksLikeCloudflareChallenge(html) && !(await hasCloudflareClearance(page))) {
        throw new Error("claude_security_verification_blocked");
      }
    }
    await page.waitForTimeout(500);
  } else {
    await preparePageForPlatform(page, platform);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  }

  const extractor = PLAYWRIGHT_EXTRACTORS[platform];
  if (!extractor) {
    throw new Error(`No extractor for platform: ${platform}`);
  }

  let result = await extractor(page);

  if (shouldRetryRenderedExtraction(platform, result?.messages ?? [])) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(1500);

    const retryResult = await extractor(page);
    if (isBetterExtraction(platform, retryResult?.messages ?? [], result?.messages ?? [])) {
      result = retryResult;
    }
  }

  if (shouldRetryRenderedExtraction(platform, result?.messages ?? []) && (platform === "claude" || platform === "gemini")) {
    const html = await page.content().catch(() => "");
    if (html) {
      const renderedResult = await extractRenderedHtml(platform, html).catch(() => null);
      if (renderedResult && isBetterExtraction(platform, renderedResult.messages, result?.messages ?? [])) {
        result = renderedResult;
      }
    }
  }

  return result;
}

function shouldRetryRenderedExtraction(platform: Platform, messages: Array<{ role?: string; content?: string }>): boolean {
  if (messages.length === 0) return true;

  const hasAssistant = messages.some((m) => m.role === "assistant" && (m.content ?? "").trim().length > 0);
  if (!hasAssistant && platform !== "chatgpt" && platform !== "t3chat") return true;

  const joined = messages.map((m) => (m.content ?? "").toLowerCase()).join("\n");
  const noisy = ["sign in", "privacy policy", "terms of service", "menu", "settings"];
  let hits = 0;
  for (const marker of noisy) {
    if (joined.includes(marker)) hits++;
  }
  return hits >= 3;
}

function isBetterExtraction(
  platform: Platform,
  candidate: Array<{ role?: string; content?: string }>,
  baseline: Array<{ role?: string; content?: string }>
): boolean {
  const score = (msgs: Array<{ role?: string; content?: string }>) => {
    const nonEmpty = msgs.filter((m) => (m.content ?? "").trim().length > 0).length;
    const assistants = msgs.filter((m) => m.role === "assistant" && (m.content ?? "").trim().length > 0).length;
    const users = msgs.filter((m) => m.role === "user" && (m.content ?? "").trim().length > 0).length;
    const bonus = platform !== "chatgpt" && platform !== "t3chat" && assistants > 0 ? 2 : 0;
    return nonEmpty + assistants + users + bonus;
  };

  return score(candidate) > score(baseline);
}

async function applyClaudeSessionCookies(page: any): Promise<void> {
  const raw = Bun.env.CLAUDE_COOKIES_JSON;
  if (!raw) return;

  try {
    const cookies = JSON.parse(raw);
    if (!Array.isArray(cookies) || cookies.length === 0) return;
    await page.context().addCookies(cookies);
  } catch (err) {
    if (isDev()) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[claude] Failed to parse/apply CLAUDE_COOKIES_JSON: ${message}`);
    }
  }
}

async function preparePageForPlatform(page: any, platform: Platform): Promise<void> {
  await page.mouse.move(200, 160, { steps: 12 }).catch(() => {});

  if (platform === "gemini") {
    await dismissGeminiConsent(page);
    await waitForPlatformSignals(page, [
      "user-query",
      "model-response",
      "text=You said",
      "text=Gemini may display inaccurate info",
    ]);
    return;
  }
}

async function dismissGeminiConsent(page: any): Promise<void> {
  const selectors = [
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Accept")',
    'button[aria-label*="Accept"]',
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
      await button.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
      break;
    }
  }
}

async function waitForPlatformSignals(page: any, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    const found = await page.locator(selector).first().isVisible({ timeout: 2500 }).catch(() => false);
    if (found) return;
  }
}

function looksLikeCloudflareChallenge(html: string): boolean {
  const lower = html.toLowerCase();
  const markers = [
    "__cf$cv$params",
    "cdn-cgi/challenge-platform",
    "jsd/main.js",
    "just a moment",
    "checking your browser",
    "performing security verification",
    "verification successful. waiting for",
    "enable javascript and cookies to continue",
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits++;
  }
  return hits >= 2;
}

async function hasCloudflareClearance(page: any): Promise<boolean> {
  try {
    const cookies = await page.context().cookies("https://claude.ai");
    return cookies.some((cookie: { name?: string }) => cookie.name === "cf_clearance");
  } catch {
    return false;
  }
}

async function extractRenderedHtml(platform: Platform, html: string): Promise<{ messages: any[]; skippedCount: number }> {
  if (platform === "gemini") {
    return extractGeminiCheerio(html);
  }

  throw new Error(`unsupported_rendered_html_platform:${platform}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

const port = parseInt(Bun.env.PORT ?? "4000", 10);

async function bootstrap() {
  console.log("[browser] Initializing Chromium...");
  await browserManager.init();
  console.log("[browser] Ready.");

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  console.log(`[server] Listening on port ${port}`);
  Bun.serve({
    fetch: app.fetch,
    port,
  });
}

async function gracefulShutdown() {
  console.log("[server] Shutting down...");
  await browserManager.close();
  process.exit(0);
}

bootstrap();
