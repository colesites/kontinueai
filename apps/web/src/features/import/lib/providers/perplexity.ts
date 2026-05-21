import * as cheerio from "cheerio";
import type { ProviderParser } from "./types";
import type { NormalizedTranscript, NormalizedMessage } from "../../types";

export const perplexityParser: ProviderParser = {
  name: "perplexity",

  detect: (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes("perplexity.ai");
    } catch {
      return false;
    }
  },

  fetch: async (url: string): Promise<string> => {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    return response.text();
  },

  parse: async (html: string, url: string): Promise<NormalizedTranscript> => {
    const $ = cheerio.load(html);
    const messages: NormalizedMessage[] = [];

    // Try to find embedded data
    const scripts = $("script[type='application/json']").toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (content) {
        try {
          const data = JSON.parse(content);
          extractPerplexityMessages(data, messages);
        } catch {
          // Continue
        }
      }
    }

    // Also check regular scripts
    if (messages.length === 0) {
      const regularScripts = $("script").toArray();
      for (const script of regularScripts) {
        const content = $(script).html();
        if (
          content?.includes("__NEXT_DATA__") ||
          content?.includes("messages")
        ) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[0]);
              extractPerplexityMessages(data, messages);
            }
          } catch {
            // Continue
          }
        }
      }
    }

    // Fallback: DOM parsing
    if (messages.length === 0) {
      const queryEls = $('[class*="query"], [class*="question"]').toArray();
      const answerEls = $('[class*="answer"], [class*="response"]').toArray();

      // Interleave queries and answers
      const maxLen = Math.max(queryEls.length, answerEls.length);
      for (let i = 0; i < maxLen; i++) {
        if (queryEls[i]) {
          const content = $(queryEls[i]).text().trim();
          if (content) {
            messages.push({ role: "user", content, order: messages.length });
          }
        }
        if (answerEls[i]) {
          const content = $(answerEls[i]).text().trim();
          if (content) {
            messages.push({
              role: "assistant",
              content,
              order: messages.length,
            });
          }
        }
      }
    }

    // Extract title from first message
    const firstMessage = messages[0];
    const title = firstMessage
      ? firstMessage.content.slice(0, 50) +
        (firstMessage.content.length > 50 ? "..." : "")
      : "Imported Perplexity Chat";

    return {
      provider: "perplexity",
      title,
      messages,
      sourceUrl: url,
      fetchedAt: Date.now(),
    };
  },
};

function extractPerplexityMessages(
  data: unknown,
  messages: NormalizedMessage[],
) {
  if (!data) return;

  if (Array.isArray(data)) {
    for (const item of data) {
      extractPerplexityMessages(item, messages);
    }
  } else if (typeof data === "object") {
    const obj = data as Record<string, unknown>;

    // Look for query/answer patterns
    if (typeof obj.query === "string") {
      messages.push({
        role: "user",
        content: obj.query,
        order: messages.length,
      });
    }
    if (typeof obj.answer === "string") {
      messages.push({
        role: "assistant",
        content: obj.answer,
        order: messages.length,
      });
    }
    if (typeof obj.content === "string" && typeof obj.role === "string") {
      messages.push({
        role: obj.role === "user" ? "user" : "assistant",
        content: obj.content,
        order: messages.length,
      });
    }

    for (const key of Object.keys(obj)) {
      if (key !== "query" && key !== "answer") {
        extractPerplexityMessages(obj[key], messages);
      }
    }
  }
}

