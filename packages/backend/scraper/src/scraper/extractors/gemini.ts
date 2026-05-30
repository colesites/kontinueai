import type { Page } from "playwright";
import type { RawMessage } from "../../types";

export interface ExtractResult {
  messages: RawMessage[];
  skippedCount: number;
}

export async function extractGemini(page: Page): Promise<ExtractResult> {
  const result = await page.evaluate(() => {
    const messages: RawMessage[] = [];
    const seen = new Set<string>();

    function isLikelyGeminiNoise(text: string): boolean {
      const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!normalized) return true;

      const markers = [
        "sign in",
        "about gemini",
        "gemini app",
        "subscriptions",
        "for business",
        "google privacy policy",
        "google terms of service",
        "your privacy",
      ];

      let hits = 0;
      for (const marker of markers) {
        if (normalized.includes(marker)) hits++;
      }

      if (normalized.startsWith("sign in")) return true;
      return hits >= 3 && !normalized.includes("you said");
    }

    function pushMessage(message: RawMessage) {
      const content = message.content.trim();
      if (!content) return;
      if (isLikelyGeminiNoise(content)) return;
      const key = `${message.role}:${content}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({ ...message, content });
    }

    // Try live chat selectors (web components with shadow DOM)
    const liveNodes = document.querySelectorAll(
      "user-query, model-response, [class*='user-query-container'], [class*='response-container'], [class*='model-response']"
    );

    if (liveNodes.length > 0) {
      let filteredIndex = 0;
      for (const node of Array.from(liveNodes)) {
        const el = node as HTMLElement;
        if (el.closest("header, nav, footer, [class*='onegoogle'], [class*='appbar'], [class*='toolbar']")) {
          continue;
        }

        const tag = el.tagName.toLowerCase();

        let role: "user" | "assistant";
        if (tag === "user-query") role = "user";
        else if (tag === "model-response") role = "assistant";
        else if (el.closest("user-query")) role = "user";
        else if (el.closest("model-response")) role = "assistant";
        else {
          const cls = Array.from(el.classList).join(" ").toLowerCase();
          if (cls.includes("user-query-container")) role = "user";
          else if (cls.includes("response-container") || cls.includes("model-response")) role = "assistant";
          else role = filteredIndex % 2 === 0 ? "user" : "assistant";
        }

        let content = "";
        if (el.shadowRoot) {
          const textEl = el.shadowRoot.querySelector(".query-text, .response-text, .markdown");
          if (textEl) content = textEl.textContent?.trim() ?? "";
        }
        if (!content) content = el.innerText?.trim() ?? "";
        if (isLikelyGeminiNoise(content)) continue;

        if (content.length > 0) {
          const codes: Array<{ language: string; code: string }> = [];
          for (const codeEl of Array.from(el.querySelectorAll("pre code"))) {
            const langClass = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
            codes.push({ language: langClass ? langClass.replace("language-", "") : "text", code: codeEl.textContent ?? "" });
          }
          const images: string[] = [];
          for (const img of Array.from(el.querySelectorAll("img"))) {
            const src = img.getAttribute("src");
            if (src) { try { images.push(new URL(src, location.href).href); } catch { images.push(src); } }
          }
          const files: string[] = [];
          for (const a of Array.from(el.querySelectorAll("a[href]"))) {
            const href = a.getAttribute("href");
            if (href && (href.startsWith("http") || href.startsWith("/"))) { try { files.push(new URL(href, location.href).href); } catch { files.push(href); } }
          }
          pushMessage({ role, content, images, codes, files });
          filteredIndex++;
        }
      }
      if (messages.length > 0) return { messages, skipped: 0 };
    }

    // Shared link: find "You said" text nodes in the DOM to split messages
    // Structure: header → "You said" → user msg → AI response → "You said" → user msg → AI response
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    const textNodes: Node[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node.textContent ?? "").trim().length > 0) {
        textNodes.push(node);
      }
    }

    // Find "You said" nodes
    const youSaidIndices: number[] = [];
    for (let i = 0; i < textNodes.length; i++) {
      const text = (textNodes[i].textContent ?? "").trim();
      if (text === "You said") {
        youSaidIndices.push(i);
      }
    }

    if (youSaidIndices.length === 0) {
      // No "You said" found — try paragraph splitting from main content
      const mainContent = document.querySelector("main, article, [role='main']") || document.body;
      const fullText = (mainContent as HTMLElement).textContent ?? "";
      const cleaned = fullText
        .replace(/Gemini may display inaccurate info.*$/i, "")
        .replace(/Shared.*$/i, "")
        .trim();
      const paragraphs = cleaned.split(/\n{2,}/).filter((p) => p.trim().length > 20);
      for (let i = 0; i < paragraphs.length; i++) {
        pushMessage({
          role: i % 2 === 0 ? "user" : "assistant",
          content: paragraphs[i].trim(),
          images: [],
          codes: [],
          files: [],
        });
      }
      return { messages, skipped: 0 };
    }

    // Extract file/image links from header (before first "You said")
    const headerEnd = youSaidIndices[0];
    const headerLinks: string[] = [];
    const headerImages: string[] = [];
    for (let i = 0; i < headerEnd; i++) {
      const parent = textNodes[i].parentNode as Element | null;
      if (parent) {
        const links = parent.querySelectorAll("a[href]");
        for (const a of Array.from(links)) {
          const href = a.getAttribute("href") ?? "";
          if (href.includes("lh3.googleusercontent.com") || href.includes("googleusercontent.com")) {
            try { headerImages.push(new URL(href, location.href).href); } catch { headerImages.push(href); }
          } else if (!href.includes("accounts.google.com") && !href.includes("policies.google.com") && !href.includes("support.google.com")) {
            try { headerLinks.push(new URL(href, location.href).href); } catch { headerLinks.push(href); }
          }
        }
      }
    }

    // Process each turn
    for (let t = 0; t < youSaidIndices.length; t++) {
      const userStart = youSaidIndices[t] + 1;
      const userEnd = t + 1 < youSaidIndices.length ? youSaidIndices[t + 1] : textNodes.length;

      // User message: text nodes between "You said" and the AI response
      // The AI response starts after a gap or after the user message text
      // Collect all text nodes, the first chunk is user, rest is AI

      const userTextNodes = textNodes.slice(userStart, userEnd);

      // Find where AI response starts — look for the first substantial text block after user message
      // Heuristic: user message is usually short (1-3 text nodes), AI response is longer
      // Or: there's a visual break (different parent element)

      let userContent = "";
      let aiContent = "";
      let aiImages: string[] = [];
      let aiFiles: string[] = [];
      let aiCodes: Array<{ language: string; code: string }> = [];

      // Collect images/files from user section
      const userImages: string[] = [...headerImages];
      const userFiles: string[] = [...headerLinks];

      for (const textNode of userTextNodes) {
        const text = (textNode.textContent ?? "").trim();
        if (!text) continue;

        // Skip footer text
        if (text.includes("Google Privacy Policy") || text.includes("Terms of Service") || text.includes("Export to Sheets")) continue;

        // Determine if this is user or AI text
        // User messages are typically short and come first
        // AI responses are longer, contain formatting, lists, etc.
        if (!userContent && text.length < 200) {
          userContent = text;
        } else if (!userContent && text.length >= 200) {
          // Long text right after "You said" — might be the user message
          userContent = text;
        } else {
          aiContent += (aiContent ? "\n\n" : "") + text;

          // Extract codes, images, files from AI response
          const parent = textNode.parentNode as Element | null;
          if (parent) {
            for (const pre of Array.from(parent.querySelectorAll("pre code"))) {
              const langClass = Array.from(pre.classList).find((c) => c.startsWith("language-"));
              aiCodes.push({ language: langClass ? langClass.replace("language-", "") : "text", code: pre.textContent ?? "" });
            }
            for (const img of Array.from(parent.querySelectorAll("img"))) {
              const src = img.getAttribute("src");
              if (src) { try { aiImages.push(new URL(src, location.href).href); } catch { aiImages.push(src); } }
            }
            for (const a of Array.from(parent.querySelectorAll("a[href]"))) {
              const href = a.getAttribute("href");
              if (href && (href.startsWith("http") || href.startsWith("/"))) { try { aiFiles.push(new URL(href, location.href).href); } catch { aiFiles.push(href); } }
            }
          }
        }
      }

      if (userContent.trim()) {
        pushMessage({ role: "user", content: userContent.trim(), images: userImages, codes: [], files: userFiles });
      }
      if (aiContent.trim()) {
        pushMessage({ role: "assistant", content: aiContent.trim(), images: aiImages, codes: aiCodes, files: aiFiles });
      }
    }

    return { messages, skipped: 0 };
  });

  return { messages: result.messages, skippedCount: result.skipped };
}
