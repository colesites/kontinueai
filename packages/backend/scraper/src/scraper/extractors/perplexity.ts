import type { Page } from "playwright";
import type { RawMessage } from "../../types";

export interface ExtractResult {
  messages: RawMessage[];
  skippedCount: number;
}

export async function extractPerplexity(page: Page): Promise<ExtractResult> {
  const result = await page.evaluate(() => {
    const messages: RawMessage[] = [];
    const seen = new Set<string>();

    function isNoise(text: string): boolean {
      const t = text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!t) return true;
      const markers = [
        "related questions",
        "follow up",
        "sources",
        "share",
        "menu",
        "settings",
        "privacy policy",
        "terms of service",
        "sign in",
      ];
      let hits = 0;
      for (const marker of markers) {
        if (t.includes(marker)) hits++;
      }
      return t.startsWith("sign in") || hits >= 3;
    }

    function hasAssistant(msgs: RawMessage[]): boolean {
      return msgs.some((m) => m.role === "assistant" && m.content.trim().length > 0);
    }

    function pushMessage(message: RawMessage) {
      const content = message.content.trim();
      if (!content || isNoise(content)) return;
      const key = `${message.role}:${content}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({ ...message, content });
    }

    function getContent(el: Element): string {
      const clone = el.cloneNode(true) as HTMLElement;
      for (const pre of Array.from(clone.querySelectorAll("pre"))) {
        const code = pre.querySelector("code");
        const lang = code ? Array.from(code.classList).find((c) => c.startsWith("language-"))?.replace("language-", "") || "" : "";
        const text = pre.textContent ?? "";
        pre.replaceWith(document.createTextNode(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`));
      }
      for (const br of Array.from(clone.querySelectorAll("br"))) {
        br.replaceWith(document.createTextNode("\n"));
      }
      for (const block of Array.from(clone.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6"))) {
        const el2 = block as HTMLElement;
        const tag = el2.tagName.toLowerCase();
        const prefix = tag.startsWith("h") ? "#" + tag.replace("h", "") + " " : (tag === "li" ? "- " : "");
        if (el2.textContent && el2.textContent.trim()) {
          el2.replaceWith(document.createTextNode(prefix + el2.textContent + "\n"));
        }
      }
      for (const strong of Array.from(clone.querySelectorAll("strong, b"))) {
        strong.replaceWith(document.createTextNode(`**${strong.textContent}**`));
      }
      for (const em of Array.from(clone.querySelectorAll("em, i"))) {
        em.replaceWith(document.createTextNode(`*${em.textContent}*`));
      }
      for (const code of Array.from(clone.querySelectorAll("code"))) {
        code.replaceWith(document.createTextNode(`\`${code.textContent}\``));
      }
      return (clone.textContent ?? "").trim();
    }

    function extract(el: Element): { content: string; codes: Array<{ language: string; code: string }>; images: string[]; files: string[] } {
      const content = getContent(el);
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
      return { content, codes, images, files };
    }

    const nodes = document.querySelectorAll('[data-testid="user-message"], [data-testid="answer"], .prose, [class*="message"], [class*="answer"], [class*="query"], [class*="response"]');
    let skipped = 0;
    let filteredIndex = 0;

    for (const node of Array.from(nodes)) {
      const el = node as HTMLElement;
      if (el.closest("nav, footer, header, [class*='sidebar'], [class*='input']")) { skipped++; continue; }
      const cls = Array.from(el.classList).join(" ").toLowerCase();
      if (cls.includes("relatedquestions") || cls.includes("followupsuggestion") || cls.includes("sources")) { skipped++; continue; }

      let role: "user" | "assistant";
      const tid = el.getAttribute("data-testid");
      if (tid === "user-message") role = "user";
      else if (tid === "answer") role = "assistant";
      else if (el.closest('[data-testid="user-message"]')) role = "user";
      else if (el.closest('[data-testid="answer"]')) role = "assistant";
      else if (cls.includes("usermessage") || cls.includes("query")) role = "user";
      else if (cls.includes("answerbody") || cls.includes("prose") || cls.includes("response") || cls.includes("answer")) role = "assistant";
      else if (el.querySelector("[data-citation]")) role = "assistant";
      else role = filteredIndex % 2 === 0 ? "user" : "assistant";

      const c = extract(el);
      if (c.content.length > 0) {
        pushMessage({ role, ...c });
        filteredIndex++;
      }
    }

    if (messages.length > 0 && hasAssistant(messages)) {
      return { messages, skipped };
    }

    messages.length = 0;
    seen.clear();

    const mainContent = document.querySelector("main, article, [role='main']") || document.body;
    const fullText = (mainContent as HTMLElement).innerText ?? "";
    const cleaned = fullText
      .replace(/Related Questions[\s\S]*$/i, "")
      .replace(/Follow up[\s\S]*$/i, "")
      .replace(/Sources[\s\S]*$/i, "")
      .trim();

    const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length >= 20 && !isNoise(p));
    if (paragraphs.length >= 2) {
      for (let i = 0; i < paragraphs.length; i++) {
        pushMessage({
          role: i % 2 === 0 ? "user" : "assistant",
          content: paragraphs[i],
          images: [],
          codes: [],
          files: [],
        });
      }
    } else if (cleaned.length > 20) {
      pushMessage({ role: "user", content: cleaned, images: [], codes: [], files: [] });
    }

    return { messages, skipped };
  });

  return { messages: result.messages, skippedCount: result.skipped };
}
