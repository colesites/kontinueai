import * as cheerio from "cheerio";
import type { ProviderParser } from "./types";
import type { NormalizedTranscript, NormalizedMessage } from "../../types";

export const genericParser: ProviderParser = {
  name: "unknown",

  detect: (): boolean => true, // Fallback for any URL

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

    // Generic parsing strategies

    // 1. Look for common message container patterns
    const messageSelectors = [
      '[class*="message"]',
      '[class*="chat-"]',
      '[class*="conversation"]',
      '[class*="turn"]',
      '[data-role]',
      '[data-message]',
    ];

    for (const selector of messageSelectors) {
      const elements = $(selector).toArray();
      if (elements.length >= 2) {
        elements.forEach((el, i) => {
          const $el = $(el);
          const className = ($el.attr("class") || "").toLowerCase();
          const dataRole = $el.attr("data-role") || "";

          const isUser =
            className.includes("user") ||
            className.includes("human") ||
            dataRole === "user" ||
            dataRole === "human";

          const content =
            $el.find('[class*="content"], [class*="text"], .prose, .markdown').text().trim() ||
            $el.text().trim();

          if (content && content.length > 5) {
            messages.push({
              role: isUser ? "user" : "assistant",
              content,
              order: i,
            });
          }
        });

        if (messages.length >= 2) break;
      }
    }

    // 2. Try to extract from structured data
    if (messages.length < 2) {
      const scripts = $('script[type="application/ld+json"]').toArray();
      for (const script of scripts) {
        try {
          const data = JSON.parse($(script).html() || "{}");
          if (data.text || data.articleBody) {
            messages.push({
              role: "user",
              content: data.text || data.articleBody,
              order: 0,
            });
          }
        } catch {
          // Continue
        }
      }
    }

    // 3. Fallback: Extract main content as single message
    if (messages.length === 0) {
      const mainContent =
        $("main").text().trim() ||
        $("article").text().trim() ||
        $('[role="main"]').text().trim() ||
        $("body").text().trim();

      if (mainContent && mainContent.length > 20) {
        // Try to split by common patterns
        const parts = mainContent.split(/(?:User|Human|You|Me)[\s:]+/i);
        if (parts.length > 1) {
          parts.forEach((part, i) => {
            const trimmed = part.trim();
            if (trimmed) {
              messages.push({
                role: i % 2 === 0 ? "assistant" : "user",
                content: trimmed.slice(0, 5000),
                order: i,
              });
            }
          });
        } else {
          messages.push({
            role: "user",
            content: mainContent.slice(0, 5000),
            order: 0,
          });
        }
      }
    }

    // Extract title
    let title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim() ||
      "Imported Chat";

    title = title.slice(0, 100);

    return {
      provider: "unknown",
      title,
      messages,
      sourceUrl: url,
      fetchedAt: Date.now(),
    };
  },
};

