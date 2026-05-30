import type { Page } from "playwright";
import type { RawMessage } from "../../types";

export interface ExtractResult {
  messages: RawMessage[];
  skippedCount: number;
}

export async function extractChatGPT(page: Page): Promise<ExtractResult> {
  await page
    .waitForSelector(
      "[data-message-author-role], [data-testid^='conversation-turn-']",
      { timeout: 20000 },
    )
    .catch(() => null);
  // Give late-hydrating turns a moment to attach.
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    // Prefer explicit author-role nodes (reliable on share pages). Each one sits
    // inside a conversation-turn, so selecting turns too would double-count.
    let nodes: Element[] = Array.from(
      document.querySelectorAll("[data-message-author-role]"),
    );
    if (nodes.length === 0) {
      nodes = Array.from(
        document.querySelectorAll("[data-testid^='conversation-turn-']"),
      );
    }
    const messages: RawMessage[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    let filteredIndex = 0;

    function isNoise(text: string): boolean {
      const t = text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!t) return true;
      const markers = [
        "log in",
        "sign up",
        "terms of use",
        "privacy policy",
        "chatgpt can make mistakes",
        "new chat",
      ];
      let hits = 0;
      for (const marker of markers) {
        if (t.includes(marker)) hits++;
      }
      return hits >= 2;
    }

    function pushMessage(message: RawMessage) {
      const content = message.content.trim();
      const hasAttachments =
        message.images.length > 0 ||
        message.files.length > 0 ||
        message.codes.length > 0;
      // Keep image/file-only messages (e.g. a user uploading a photo with no
      // caption). Only the noise filter still applies to text.
      if (!content && !hasAttachments) return;
      if (content && isNoise(content)) return;
      const key = `${message.role}:${content.slice(0, 500)}:${message.images.join(",")}:${message.files.join(",")}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({ ...message, content });
    }

    function extract(el: Element) {
      const content =
        (el.querySelector(".whitespace-pre-wrap, .markdown, .prose") as HTMLElement)
          ?.innerText?.trim() ??
        (el as HTMLElement).innerText?.trim() ??
        "";

      const codes: Array<{ language: string; code: string }> = [];
      for (const codeEl of Array.from(el.querySelectorAll("pre code"))) {
        const langClass = Array.from(codeEl.classList).find((c) =>
          c.startsWith("language-"),
        );
        codes.push({
          language: langClass ? langClass.replace("language-", "") : "text",
          code: codeEl.textContent ?? "",
        });
      }

      const images: string[] = [];
      for (const img of Array.from(el.querySelectorAll("img"))) {
        let src = img.getAttribute("src") || img.getAttribute("data-src") || "";
        // Lazy-loaded images expose the real URL in srcset; take the last
        // (highest-res) candidate.
        if (!src) {
          const srcset = img.getAttribute("srcset");
          if (srcset) src = srcset.split(",").pop()?.trim().split(/\s+/)[0] ?? "";
        }
        if (!src) continue;
        // blob:/data: URLs are page-local and can't render outside the page.
        if (src.startsWith("blob:") || src.startsWith("data:")) continue;
        // Skip tiny UI chrome (avatars, icons).
        const width =
          (img as HTMLImageElement).naturalWidth ||
          parseInt(img.getAttribute("width") || "0", 10);
        if (width && width < 32) continue;
        try { images.push(new URL(src, location.href).href); } catch { images.push(src); }
      }

      const files: string[] = [];
      for (const a of Array.from(el.querySelectorAll("a[href]"))) {
        const href = a.getAttribute("href");
        if (!href) continue;
        const isAttachment =
          a.hasAttribute("download") ||
          href.includes("files.oaiusercontent.com") ||
          href.includes("/backend-api/files/") ||
          href.includes("sandbox:");
        if (!isAttachment) continue;
        try { files.push(new URL(href, location.href).href); } catch { files.push(href); }
      }

      return { content, codes, images, files };
    }

    for (const node of nodes) {
      const el = node as HTMLElement;

      const roleAttr =
        el.getAttribute("data-message-author-role") ??
        el.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") ??
        null;
      if (roleAttr === "tool" || roleAttr === "system") {
        skipped++;
        continue;
      }

      let role: "user" | "assistant" | null = null;

      if (roleAttr === "user" || roleAttr === "assistant") {
        role = roleAttr;
      }

      if (!role) {
        if (el.querySelector('[class*="user-message"]')) role = "user";
        else if (el.querySelector('[class*="agent-turn"]')) role = "assistant";
      }

      if (!role) {
        role = filteredIndex % 2 === 0 ? "user" : "assistant";
      }

      pushMessage({ role, ...extract(el) });
      filteredIndex++;
    }

    if (messages.length === 0) {
      const main = document.querySelector("main, article, [role='main']") as HTMLElement | null;
      const text = main?.innerText?.trim() ?? document.body.innerText?.trim() ?? "";
      const blocks = text
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter((block) => block.length > 20 && !isNoise(block));

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (!block) continue;
        pushMessage({
          role: i % 2 === 0 ? "user" : "assistant",
          content: block,
          images: [],
          codes: [],
          files: [],
        });
      }
    }

    return { messages, skipped };
  });

  return { messages: result.messages, skippedCount: result.skipped };
}
