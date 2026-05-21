import type { Provider } from "@repo/utils/url-safety";
import type { ImportPreviewResponse } from "../types";

type ImportedMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ScrapeActionResult = {
  title?: string | null;
  messages?: ImportedMessage[];
};

type ResolveImportOptions = {
  url: string;
  provider: Provider | null | undefined;
  scrapeUrl: (args: { url: string }) => Promise<ScrapeActionResult>;
  previewTimeoutMs?: number;
};

export type ResolvedImport = {
  title: string;
  provider: Provider;
  messages: ImportedMessage[];
  source: "preview" | "firecrawl";
};

async function tryPreviewImport(
  url: string,
  timeoutMs: number,
): Promise<ResolvedImport | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ImportPreviewResponse;
    if (!data.success || !data.transcript?.messages?.length) {
      return null;
    }

    return {
      title: data.transcript.title || "Imported Chat",
      provider: data.provider,
      messages: data.transcript.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      source: "preview",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveImport(
  options: ResolveImportOptions,
): Promise<ResolvedImport> {
  const { url, provider, scrapeUrl, previewTimeoutMs = 2500 } = options;

  const previewResult = await tryPreviewImport(url, previewTimeoutMs);
  if (previewResult) {
    return previewResult;
  }

  const result = await scrapeUrl({ url });
  const messages = result.messages ?? [];

  if (!messages.length) {
    throw new Error(
      "Could not extract chat messages from this link. Try another link or paste the transcript manually.",
    );
  }

  return {
    title: result.title || "Imported Chat",
    provider: provider ?? "unknown",
    messages,
    source: "firecrawl",
  };
}
