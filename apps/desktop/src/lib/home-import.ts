// Import a shared ChatGPT / Claude / Gemini / … link into a Home chat, the
// same way the web app does: the chat is created first, then filled in the
// background. Firecrawl hosts run as a Convex action (progress is written to
// the chat title); scraper hosts go through the web app's scrape route.

import { invoke } from "@tauri-apps/api/core";
import { detectProvider, getImportStrategy } from "@repo/utils";
import { getSessionToken } from "./kode-chat";
import { ensureKontinueServer } from "./desktop-auth";

export type ImportDeps = {
  createChat: (args: {
    title: string;
    provider: string;
    sourceUrl?: string;
    importMethod: "automatic" | "manual";
    messages: { role: "system" | "user" | "assistant"; content: string }[];
  }) => Promise<string>;
  importViaFirecrawl: (args: { chatId: string; url: string }) => Promise<{ success: boolean; error?: string }>;
  appendImported: (args: {
    chatId: string;
    title: string;
    messages: { role: "user" | "assistant"; content: string }[];
  }) => Promise<unknown>;
  appendFailure: (args: { chatId: string; errorMessage: string }) => Promise<unknown>;
};

/** A shared link we can try, or the reason it can't be imported. */
export function checkShareUrl(raw: string): { url: string } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: "Paste a shared chat link." };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { error: "That isn't a link." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { error: "Use an http(s) link." };
  return { url: parsed.toString() };
}

export const PROVIDER_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  perplexity: "Perplexity",
  deepseek: "DeepSeek",
  copilot: "Copilot",
  qwen: "Qwen",
  kimi: "Kimi",
  meta: "Meta AI",
  t3chat: "T3 Chat",
  manus: "Manus",
};

export function providerFor(url: string): string {
  try {
    return detectProvider(url);
  } catch {
    return "unknown";
  }
}

/** Create the chat and start filling it. Resolves with the chat id as soon as
 *  the chat exists; `done` settles when the import finishes or fails. */
export async function startSharedImport(url: string, deps: ImportDeps): Promise<{ chatId: string; done: Promise<void> }> {
  const chatId = await deps.createChat({
    title: "Importing conversation...",
    provider: providerFor(url),
    sourceUrl: url,
    importMethod: "automatic",
    messages: [],
  });
  const done = runImport(chatId, url, deps).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await deps.appendFailure({ chatId, errorMessage: message }).catch(() => {});
  });
  return { chatId, done };
}

async function runImport(chatId: string, url: string, deps: ImportDeps) {
  if (getImportStrategy(url) === "firecrawl") {
    // The action appends the messages, or the failure notice, itself.
    await deps.importViaFirecrawl({ chatId, url });
    return;
  }
  await ensureKontinueServer();
  const token = await getSessionToken();
  if (!token) throw new Error("Sign in to import chats.");
  const data = await invoke<{ success?: boolean; title?: string; messages?: { role: "user" | "assistant"; content: string }[]; message?: string }>(
    "kontinue_api_post",
    { path: "/api/import/scrape", sessionToken: token, body: { url } },
  );
  if (!data.success || !data.messages?.length) throw new Error(data.message ?? "Couldn't read that shared chat.");
  await deps.appendImported({ chatId, title: data.title ?? "Imported chat", messages: data.messages });
}

/** "Importing 42% · Fetching shared page" (written by the import action). */
export function importProgressFromTitle(title: string | undefined): { percent: number; stage: string } | null {
  if (!title) return null;
  if (title === "Importing conversation...") return { percent: 2, stage: "Starting" };
  const match = /^Importing (\d{1,3})% · (.+)$/.exec(title);
  return match ? { percent: Number(match[1]), stage: match[2] } : null;
}
