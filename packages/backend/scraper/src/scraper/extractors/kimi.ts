import type { Page } from "playwright";
import type { RawMessage } from "../../types";

export interface ExtractResult {
  messages: RawMessage[];
  skippedCount: number;
}

export async function extractKimi(page: Page): Promise<ExtractResult> {
  await page.waitForSelector(".segment-user, .segment-assistant", { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const messages: RawMessage[] = [];

    function htmlToMarkdown(el: Element): string {
      const clone = el.cloneNode(true) as HTMLElement;
      for (const pre of Array.from(clone.querySelectorAll("pre"))) {
        const code = pre.querySelector("code");
        const lang = code ? Array.from(code.classList).find((c) => c.startsWith("language-"))?.replace("language-", "") || "" : "";
        const text = (code ?? pre).textContent ?? "";
        pre.replaceWith(document.createTextNode(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`));
      }
      for (const br of Array.from(clone.querySelectorAll("br"))) br.replaceWith(document.createTextNode("\n"));
      for (const strong of Array.from(clone.querySelectorAll("strong, b"))) strong.replaceWith(document.createTextNode(`**${strong.textContent}**`));
      for (const em of Array.from(clone.querySelectorAll("em, i"))) em.replaceWith(document.createTextNode(`*${em.textContent}*`));
      for (const code of Array.from(clone.querySelectorAll("code"))) code.replaceWith(document.createTextNode(`\`${code.textContent}\``));
      for (const block of Array.from(clone.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote"))) {
        const b = block as HTMLElement;
        const tag = b.tagName.toLowerCase();
        const prefix = tag.startsWith("h") ? "#".repeat(Number(tag[1])) + " " : tag === "li" ? "- " : "";
        if (b.textContent && b.textContent.trim()) b.replaceWith(document.createTextNode(prefix + b.textContent + "\n"));
      }
      return (clone.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
    }

    function collectCode(el: Element) {
      const codes: Array<{ language: string; code: string }> = [];
      for (const codeEl of Array.from(el.querySelectorAll("pre code"))) {
        const lang = Array.from(codeEl.classList).find((c) => c.startsWith("language-"));
        codes.push({ language: lang ? lang.replace("language-", "") : "text", code: codeEl.textContent ?? "" });
      }
      return codes;
    }

    function collectImages(el: Element) {
      const images: string[] = [];
      for (const img of Array.from(el.querySelectorAll("img"))) {
        const src = img.getAttribute("src");
        if (!src || src.startsWith("data:")) continue;
        try { images.push(new URL(src, location.href).href); } catch { images.push(src); }
      }
      return images;
    }

    for (const el of Array.from(document.querySelectorAll(".segment-user, .segment-assistant"))) {
      const role = el.classList.contains("segment-user") ? "user" : "assistant";
      const contentEl = el.querySelector(".user-content, .markdown-container, .markdown") ?? el;
      const content = htmlToMarkdown(contentEl);
      if (!content) continue;
      messages.push({ role, content, codes: collectCode(contentEl), images: collectImages(contentEl), files: [] });
    }

    return { messages, skipped: 0 };
  });

  return { messages: result.messages, skippedCount: result.skipped };
}
