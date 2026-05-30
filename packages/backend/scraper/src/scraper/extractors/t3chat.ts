import type { Page } from "playwright";
import type { RawMessage } from "../../types";

export interface ExtractResult {
  messages: RawMessage[];
  skippedCount: number;
}

export async function extractT3Chat(page: Page): Promise<ExtractResult> {
  const result = await page.evaluate(() => {
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

    const messages: RawMessage[] = [];

    // Try live chat selectors first
    const nodes = document.querySelectorAll("[data-role], [class*='message-bubble'], .chat-message, [class*='message'], [class*='bubble'], [class*='chat'], article");

    if (nodes.length > 0) {
      let filteredIndex = 0;
      for (const node of Array.from(nodes)) {
        const el = node as HTMLElement;
        if (el.closest("nav, footer, header, [class*='sidebar'], [class*='input']")) continue;
        const text = (el.textContent ?? "").trim();
        if (text.length < 3) continue;

        let role: "user" | "assistant";
        const r = el.getAttribute("data-role");
        if (r === "user" || r === "assistant") role = r;
        else {
          const cls = Array.from(el.classList).join(" ").toLowerCase();
          if (cls.includes("user-bubble") || cls.includes("human") || cls.includes("user")) role = "user";
          else if (cls.includes("assistant-bubble") || cls.includes("ai-") || cls.includes("assistant") || cls.includes("bot")) role = "assistant";
          else role = filteredIndex % 2 === 0 ? "user" : "assistant";
        }
        const c = extract(el);
        if (c.content.length > 0) {
          messages.push({ role, ...c });
          filteredIndex++;
        }
      }
      if (messages.length > 0) return { messages, skipped: 0 };
    }

    // Shared link: get full text, split by markers, strip noise
    const mainContent = document.querySelector("main, article, [role='main']");
    if (!mainContent) return { messages, skipped: 0 };

    const mainEl = mainContent as HTMLElement;

    // Remove header, nav, footer, sidebar, login links
    for (const remove of Array.from(mainEl.querySelectorAll("header, nav, footer, [class*='sidebar'], [class*='input'], button, a[href*='auth/login']"))) {
      remove.remove();
    }

    // Get text with newlines preserved (innerText respects CSS layout)
    const fullText = mainEl.innerText ?? "";

    // Split by role markers
    const segments = fullText.split(/(Your message:|Assistant Reply:)/g);

    let currentRole: "user" | "assistant" | null = null;
    let currentParts: string[] = [];

    function flush() {
      let content = currentParts.join("\n").trim();

      // Strip model names from the combined text
      content = content.replace(/[A-Za-z][\w\s.\-]*\d[\d.]*[\w\s]*\([^)]*\)/g, "").trim();
      content = content.replace(/[A-Za-z][\w\s.\-]*\d[\d.]*[\w\s]*/g, "").trim();

      // Strip stats
      content = content.replace(/\d+\.?\d*\s*tok\/sec/g, "").trim();
      content = content.replace(/\d+\s*tokens/g, "").trim();
      content = content.replace(/Time-to-First:\s*[\d.]+\s*sec/g, "").trim();

      // Strip UI noise
      content = content.replace(/[$·]+/g, "").trim();
      content = content.replace(/\b(Instant|Search|Attach|Toggle|Sidebar|New Thread|Login|Shared read-only view|Sign in to continue chat|Go to Canvas|New Chat)\b/g, "").trim();

      // Clean up
      content = content.replace(/\n{3,}/g, "\n\n").trim();
      content = content.replace(/^\s*\n/g, "").trim();
      content = content.replace(/\n\s*$/g, "").trim();

      if (content.length > 0 && currentRole) {
        messages.push({ role: currentRole, content, images: [], codes: [], files: [] });
      }
      currentParts = [];
    }

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed === "Your message:") {
        flush();
        currentRole = "user";
        continue;
      }
      if (trimmed === "Assistant Reply:") {
        flush();
        currentRole = "assistant";
        continue;
      }
      if (currentRole && trimmed.length > 0) {
        currentParts.push(trimmed);
      }
    }

    flush();

    return { messages, skipped: 0 };
  });

  return { messages: result.messages, skippedCount: result.skipped };
}
