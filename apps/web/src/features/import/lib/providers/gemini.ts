import * as cheerio from "cheerio";
import type { ProviderParser } from "./types";
import type { NormalizedTranscript, NormalizedMessage } from "../../types";

export const geminiParser: ProviderParser = {
  name: "gemini",

  detect: (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.includes("gemini.google.com") ||
        parsed.hostname.includes("aistudio.google.com") ||
        parsed.hostname.includes("bard.google.com")
      );
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

    // Try to find embedded JSON data
    const scripts = $("script").toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (
        content?.includes("conversation") ||
        content?.includes("AF_initDataCallback")
      ) {
        try {
          // Gemini embeds data in AF_initDataCallback calls
          const dataMatch = content.match(
            /AF_initDataCallback\(\{[\s\S]*?\}\);/g,
          );
          if (dataMatch) {
            for (const match of dataMatch) {
              try {
                const jsonStr = match
                  .replace("AF_initDataCallback(", "")
                  .replace(/\);$/, "");
                const data = JSON.parse(jsonStr);
                // Look for message structures in the data
                extractGeminiMessages(data, messages);
              } catch {
                // Continue trying other matches
              }
            }
          }
        } catch {
          // Continue to DOM parsing
        }
      }
    }

    // Fallback: DOM parsing for Gemini's structure
    if (messages.length === 0) {
      // Gemini uses specific container elements
      const turns = $(
        '[class*="conversation-turn"], [class*="message-row"]',
      ).toArray();

      turns.forEach((el, i) => {
        const $el = $(el);
        const isUser =
          $el.attr("class")?.includes("user") ||
          $el.find('[class*="user"]').length > 0;
        const content = $el
          .find('[class*="text-content"], [class*="message-content"]')
          .text()
          .trim();

        if (content) {
          messages.push({
            role: isUser ? "user" : "assistant",
            content,
            order: i,
          });
        }
      });
    }

    // Extract title from first message
    const firstMessage = messages[0];
    const title = firstMessage
      ? firstMessage.content.slice(0, 50) +
        (firstMessage.content.length > 50 ? "..." : "")
      : "Imported Gemini Chat";

    return {
      provider: "gemini",
      title,
      messages,
      sourceUrl: url,
      fetchedAt: Date.now(),
    };
  },
};

function extractGeminiMessages(data: unknown, messages: NormalizedMessage[]) {
  if (!data) return;

  // Recursively search for message-like structures
  if (Array.isArray(data)) {
    for (const item of data) {
      extractGeminiMessages(item, messages);
    }
  } else if (typeof data === "object") {
    const obj = data as Record<string, unknown>;

    // Look for common message patterns
    if (obj.content && typeof obj.content === "string") {
      const role =
        obj.role === "user" || obj.author === "user" ? "user" : "assistant";
      messages.push({
        role,
        content: obj.content,
        order: messages.length,
      });
    }

    // Check nested objects
    for (const key of Object.keys(obj)) {
      extractGeminiMessages(obj[key], messages);
    }
  }
}

