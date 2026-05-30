import * as cheerio from "cheerio";
import type { RawMessage } from "../../types";

export interface ExtractResult {
  messages: RawMessage[];
  skippedCount: number;
}

export async function extractGeminiCheerio(html: string): Promise<ExtractResult> {
  const $ = cheerio.load(html);
  const messages: RawMessage[] = [];
  const seen = new Set<string>();

  const pushMessage = (message: RawMessage) => {
    const content = sanitizeGeminiContent(message.content);
    if (!content) return;
    if (isLikelyGeminiAuthWall(content)) return;
    const key = `${message.role}:${content}`;
    if (seen.has(key)) return;
    seen.add(key);
    messages.push({ ...message, content });
  };

  // Remove script/style/header/footer/nav — no cookie dialogs
  $("script, style, header, footer, nav").remove();
  $("noscript, iframe").remove();

  // Try to find the main content area, fallback to body for changed share pages.
  const mainContent = $("main, article, [role='main']").first();
  const root = mainContent.length ? mainContent : $("body").first();
  if (!root.length) return { messages, skippedCount: 0 };

  const roleSelectors = [
    "user-query",
    "model-response",
    '[data-role="user"]',
    '[data-role="assistant"]',
    '[class*="user-query"]',
    '[class*="model-response"]',
    '[class*="response-container"]',
    '[class*="conversation-turn"]',
  ].join(", ");

  const roleNodes = root.find(roleSelectors);
  if (roleNodes.length > 0) {
    roleNodes.each((_, el) => {
      const $el = $(el);
      const tag = el.tagName.toLowerCase();
      const cls = ($el.attr("class") ?? "").toLowerCase();
      const dataRole = ($el.attr("data-role") ?? "").toLowerCase();
      let role: "user" | "assistant" | null = null;

      if (tag === "user-query") role = "user";
      else if (tag === "model-response") role = "assistant";
      else if (dataRole === "user" || dataRole === "human") role = "user";
      else if (dataRole === "assistant" || dataRole === "model") role = "assistant";
      else if (cls.includes("user-query") || cls.includes("user-message") || cls.includes("user-prompt")) role = "user";
      else if (cls.includes("model-response") || cls.includes("response-container") || cls.includes("assistant-message")) role = "assistant";

      if (!role) return;

      const content = extractMarkdown($, $el);
      if (!content) return;

      const codes: Array<{ language: string; code: string }> = [];
      $el.find("pre code").each((_, codeEl) => {
        const $code = $(codeEl);
        const lang = $code.attr("class")?.match(/language-(\w+)/)?.[1] ?? "text";
        codes.push({ language: lang, code: $code.text() });
      });

      const images: string[] = [];
      $el.find("img").each((_, img) => {
        const src = $(img).attr("src");
        if (src) {
          try { images.push(new URL(src, "https://gemini.google.com").href); } catch { images.push(src); }
        }
      });

      const files: string[] = [];
      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href");
        if (!href) return;
        if (href.includes("accounts.google.com") || href.includes("policies.google.com") || href.includes("support.google.com")) return;
        try { files.push(new URL(href, "https://gemini.google.com").href); } catch { files.push(href); }
      });

      pushMessage({ role, content, images, codes, files });
    });

    if (messages.length > 0) return { messages, skippedCount: 0 };
  }

  const fullText = collectText($, root);
  const cleanedText = fullText
    .replace(/Google Privacy Policy.*$/is, "")
    .replace(/Google Terms of Service.*$/is, "")
    .replace(/Gemini may display inaccurate info.*$/is, "")
    .replace(/\.{3}\s*\(truncated\).*$/is, "")
    .trim();

  const markerTurns = parseMarkerTurns(cleanedText);
  if (markerTurns.length >= 2) {
    for (const turn of markerTurns) {
      pushMessage({
        role: turn.role,
        content: turn.content,
        images: [],
        codes: [],
        files: [],
      });
    }
    if (messages.length > 0) return { messages, skippedCount: 0 };
  }

  // Strategy 1: Split by "You said" markers
  const youSaidSegments = cleanedText.split(/\bYou said\b/i);

  if (youSaidSegments.length >= 2) {
    // Extract file/image links from header
    const headerFiles: string[] = [];
    const headerImages: string[] = [];

    root.find("a[href]").each((_, a) => {
      const href = $(a).attr("href") ?? "";
      if (href.includes("lh3.googleusercontent.com") || href.includes("googleusercontent.com")) {
        try { headerImages.push(new URL(href, "https://gemini.google.com").href); } catch { headerImages.push(href); }
      } else if (!href.includes("accounts.google.com") && !href.includes("policies.google.com") && !href.includes("support.google.com")) {
        try { headerFiles.push(new URL(href, "https://gemini.google.com").href); } catch { headerFiles.push(href); }
      }
    });

    for (let i = 1; i < youSaidSegments.length; i++) {
      const segment = youSaidSegments[i].trim();
      if (!segment) continue;

      // Remove footer text
      const cleaned = segment
        .replace(/Export to Sheets.*$/is, "")
        .replace(/Google Privacy Policy.*$/is, "")
        .replace(/\.{3}\s*\(truncated\).*$/is, "")
        .trim();

      if (!cleaned) continue;

      // Split user and assistant blocks when explicit markers exist.
      const assistantSplit = cleaned.split(/\b(?:Gemini(?: said)?|Assistant)\s*:?\s*/i);

      if (assistantSplit.length >= 2) {
        const userMsg = assistantSplit[0].trim();
        const aiMsg = assistantSplit.slice(1).join("\n\n").trim();

        if (userMsg.length > 0) {
          pushMessage({
            role: "user",
            content: userMsg,
            images: i === 1 ? [...headerImages] : [],
            codes: [],
            files: i === 1 ? [...headerFiles] : [],
          });
        }

        if (aiMsg.length > 0) {
          pushMessage({
            role: "assistant",
            content: aiMsg,
            images: [],
            codes: [],
            files: [],
          });
        }
      } else {
        // Fallback split by paragraph spacing if no explicit assistant marker.
        const splitIdx = cleaned.search(/\n{2,}/);
        if (splitIdx > 0) {
          const userMsg = cleaned.substring(0, splitIdx).trim();
          const aiMsg = cleaned.substring(splitIdx).trim();

          if (userMsg.length > 0) {
            pushMessage({
              role: "user",
              content: userMsg,
              images: i === 1 ? [...headerImages] : [],
              codes: [],
              files: i === 1 ? [...headerFiles] : [],
            });
          }

          if (aiMsg.length > 0) {
            pushMessage({
              role: "assistant",
              content: aiMsg,
              images: [],
              codes: [],
              files: [],
            });
          }
          continue;
        }

        if (cleaned.length > 0) {
          pushMessage({
            role: "user",
            content: cleaned,
            images: i === 1 ? [...headerImages] : [],
            codes: [],
            files: i === 1 ? [...headerFiles] : [],
          });
        }
      }
    }

    if (messages.length > 0) return { messages, skippedCount: 0 };
  }

  // Strategy 2: Split by double+ newlines, alternate roles
  const paragraphs = cleanedText.split(/\n{2,}/).filter((p) => {
    const t = p.trim();
    if (t.length < 15) return false;
    // Skip nav/sidebar text
    if (/^(Gemini|Menu|Settings|Help|Feedback|Share|Copy|Export|Sign in|About Gemini|Subscriptions|For Business)/i.test(t)) return false;
    if (/^(Google Privacy Policy|Google Terms of Service|Your privacy)/i.test(t)) return false;
    return true;
  });

  if (paragraphs.length >= 2) {
    for (let i = 0; i < paragraphs.length; i++) {
      pushMessage({
        role: i % 2 === 0 ? "user" : "assistant",
        content: paragraphs[i].trim(),
        images: [],
        codes: [],
        files: [],
      });
    }
    if (messages.length > 0) return { messages, skippedCount: 0 };
  }

  // Strategy 3: Last resort
  const cleaned = cleanedText
    .replace(/Gemini may display inaccurate info.*$/i, "")
    .replace(/Shared.*$/i, "")
    .trim();

  if (cleaned.length > 20) {
    pushMessage({ role: "user", content: cleaned, images: [], codes: [], files: [] });
  }

  return { messages, skippedCount: 0 };
}

function collectText($: cheerio.CheerioAPI, $root: cheerio.Cheerio<any>): string {
  const blocks = $root
    .find("p, li, pre, blockquote, h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter((line) => line.length > 0);

  if (blocks.length > 0) {
    return blocks.join("\n\n");
  }

  return $root.text().replace(/\s+/g, " ").trim();
}

function parseMarkerTurns(text: string): Array<{ role: "user" | "assistant"; content: string }> {
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const userPrefix = /^(?:You said|You asked|User)\s*:?\s*/i;
  const assistantPrefix = /^(?:Gemini(?: said)?|Assistant|Model response)\s*:?\s*/i;

  let currentRole: "user" | "assistant" | null = null;
  let parts: string[] = [];

  const flush = () => {
    if (currentRole === null) return;
    const content = parts.join("\n").trim();
    if (content.length > 0) {
      turns.push({ role: currentRole, content });
    }
    parts = [];
  };

  for (const line of lines) {
    if (userPrefix.test(line)) {
      flush();
      currentRole = "user";
      const content = line.replace(userPrefix, "").trim();
      if (content.length > 0) parts.push(content);
      continue;
    }

    if (assistantPrefix.test(line)) {
      flush();
      currentRole = "assistant";
      const content = line.replace(assistantPrefix, "").trim();
      if (content.length > 0) parts.push(content);
      continue;
    }

    if (currentRole !== null) {
      parts.push(line);
    }
  }

  flush();
  return turns;
}

function extractMarkdown($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
  const clone = $el.clone();

  clone.find("pre").each((_, pre) => {
    const $pre = $(pre);
    const code = $pre.find("code").first();
    const lang = code.attr("class")?.match(/language-(\w+)/)?.[1] ?? "";
    const text = code.length ? code.text() : $pre.text();
    $pre.replaceWith(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`);
  });

  clone.find("code").each((_, code) => {
    const $code = $(code);
    $code.replaceWith(`\`${$code.text()}\``);
  });

  clone.find("strong, b").each((_, el) => {
    const $strong = $(el);
    $strong.replaceWith(`**${$strong.text()}**`);
  });

  clone.find("em, i").each((_, el) => {
    const $em = $(el);
    $em.replaceWith(`*${$em.text()}*`);
  });

  clone.find("li").each((_, el) => {
    const $li = $(el);
    $li.replaceWith(`\n- ${$li.text()}\n`);
  });

  clone.find("p, div").each((_, el) => {
    const $node = $(el);
    const text = $node.text().trim();
    if (text) {
      $node.replaceWith(`${text}\n\n`);
    }
  });

  return clone.text().trim();
}

function sanitizeGeminiContent(text: string): string {
  return text
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/googletagmanager\.com\/ns\.html[^\s]*/gi, "")
    .trim();
}

function isLikelyGeminiAuthWall(text: string): boolean {
  const normalized = text.toLowerCase();
  const markers = [
    "sign in",
    "accounts.google.com",
    "googletagmanager.com/ns.html",
    "google privacy policy",
    "google terms of service",
    "about gemini",
    "subscriptions",
    "for business",
    "try gemini",
  ];

  let hits = 0;
  for (const marker of markers) {
    if (normalized.includes(marker)) hits++;
  }

  if (normalized.startsWith("sign in")) return true;
  return hits >= 2;
}
