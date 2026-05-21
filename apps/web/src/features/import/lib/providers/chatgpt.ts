import * as cheerio from "cheerio";
import type { ProviderParser } from "./types";
import type { NormalizedTranscript, NormalizedMessage } from "../../types";

export const chatgptParser: ProviderParser = {
  name: "chatgpt",

  detect: (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.includes("chat.openai.com") ||
        parsed.hostname.includes("chatgpt.com")
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

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("text/html")) {
      throw new Error("Invalid content type");
    }

    return response.text();
  },

  parse: async (html: string, url: string): Promise<NormalizedTranscript> => {
    const $ = cheerio.load(html);
    const messages: NormalizedMessage[] = [];

    // Try to extract from script tags (ChatGPT embeds data in JSON)
    const scripts = $("script").toArray();
    for (const script of scripts) {
      const content = $(script).html();
      if (content?.includes("conversation") || content?.includes("messages")) {
        try {
          // Look for JSON data
          const jsonMatch = content.match(/\{[\s\S]*"messages"[\s\S]*\}/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            if (data.messages && Array.isArray(data.messages)) {
              type ChatGPTMessageData = {
                author?: { role?: string };
                content?: { parts?: string[] };
              };
              data.messages.forEach((msg: ChatGPTMessageData, i: number) => {
                if (
                  msg.author?.role &&
                  msg.content?.parts &&
                  Array.isArray(msg.content.parts)
                ) {
                  messages.push({
                    role: msg.author.role === "user" ? "user" : "assistant",
                    content: msg.content.parts.join("\n"),
                    order: i,
                  });
                }
              });
            }
          }
        } catch {
          // Continue to DOM parsing
        }
      }
    }

    // Fallback: DOM parsing
    if (messages.length === 0) {
      // ChatGPT uses specific class patterns for messages
      const messageContainers = $(
        '[data-message-author-role], .group\\/conversation-turn'
      ).toArray();

      messageContainers.forEach((el, i) => {
        const $el = $(el);
        const role = $el.attr("data-message-author-role");
        const content = $el.find(".markdown, .prose").text().trim();

        if (content) {
          messages.push({
            role: role === "user" ? "user" : "assistant",
            content,
            order: i,
          });
        }
      });
    }

    // Extract title
    let title = $("title").text().trim();
    if (title.includes(" - ChatGPT")) {
      title = title.replace(" - ChatGPT", "").trim();
    }
    if (!title || title === "ChatGPT") {
      const firstMessage = messages[0];
      title = firstMessage
        ? firstMessage.content.slice(0, 50) + "..."
        : "Imported ChatGPT Chat";
    }

    return {
      provider: "chatgpt",
      title,
      messages,
      sourceUrl: url,
      fetchedAt: Date.now(),
    };
  },
};

