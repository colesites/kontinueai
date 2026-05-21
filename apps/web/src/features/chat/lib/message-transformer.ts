import type { UIMessage } from "ai";
export {
  buildSearchFallbackContent,
  collectPerplexitySearchResults,
  type SearchResultSummary,
} from "./message-transformer-search";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function extractToolGeneratedImageBase64(part: UIMessage["parts"][number]): string | null {
  if (part.type === "tool-image_generation" && "output" in part) {
    const output = part.output as {
      result?: string;
      images?: Array<string | { base64: string }>;
    };
    if (typeof output?.result === "string") return output.result;
    if (Array.isArray(output?.images)) {
      const first = output.images[0];
      return typeof first === "string" ? first : first?.base64 ?? null;
    }
  }

  if (
    part.type === "tool-result" &&
    (part as { toolName?: string }).toolName === "image_generation"
  ) {
    const candidate =
      (part as { output?: { result?: string } }).output?.result ??
      (part as { result?: string }).result;
    return typeof candidate === "string" ? candidate : null;
  }

  return null;
}

export type ClockData = {
  timezone: string | null;
};

export function collectClockDataFromParts(
  parts: UIMessage["parts"],
): ClockData | null {
  for (const part of parts) {
    if (part.type === "tool-get_current_time" && "output" in part) {
      const output = part.output as { timezone?: string | null } | undefined;
      return { timezone: output?.timezone ?? null };
    }
  }
  return null;
}

export function collectImageUrlsFromParts(parts: UIMessage["parts"]): string[] {
  const imageParts: string[] = [];
  for (const part of parts) {
    if (part.type === "file" && "url" in part && part.url) {
      imageParts.push(part.url);
    }

    if (part.type === "file" && "data" in part && part.data) {
      try {
        const mime = (part as { mimeType?: string }).mimeType || "image/png";
        imageParts.push(
          `data:${mime};base64,${uint8ToBase64(part.data as Uint8Array)}`,
        );
      } catch (error) {
        console.error("Failed to decode file part", error);
      }
    }

    const toolOutputBase64 = extractToolGeneratedImageBase64(part);
    if (toolOutputBase64) {
      imageParts.push(`data:image/webp;base64,${toolOutputBase64}`);
    }
  }
  return imageParts;
}

export function mapStoredGeneratedImages(
  chatFiles: Array<{ fileType: string; messageId?: string; blobUrl: string }> | undefined,
): Record<string, string[]> {
  const byMessage: Record<string, string[]> = {};
  for (const file of chatFiles ?? []) {
    if (file.fileType !== "generated-image" || !file.messageId) continue;
    const list = (byMessage[file.messageId] ??= []);
    list.push(file.blobUrl);
  }
  return byMessage;
}

export function mapImportedFlags(
  messages: Array<{ _id: string; metadata?: { isImported?: boolean } }> | undefined,
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const message of messages ?? []) {
    map[message._id] = !!message.metadata?.isImported;
  }
  return map;
}

export function mergeImportedChunks<T extends {
  role: "user" | "assistant";
  content: string;
  imageParts: string[];
  isImported: boolean;
}>(messages: T[]): T[] {
  const merged: T[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    const canMergeImportedChunk =
      previous &&
      previous.isImported &&
      message.isImported &&
      previous.role === message.role &&
      previous.imageParts.length === 0 &&
      message.imageParts.length === 0;

    if (canMergeImportedChunk) {
      previous.content = `${previous.content}\n\n${message.content}`.trim();
      continue;
    }

    merged.push({ ...message });
  }

  return merged;
}
