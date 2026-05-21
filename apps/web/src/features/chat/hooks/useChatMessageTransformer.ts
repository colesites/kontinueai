import { useMemo } from "react";
import type { UIMessage } from "ai";
import {
  buildSearchFallbackContent,
  collectClockDataFromParts,
  collectImageUrlsFromParts,
  collectPerplexitySearchResults,
  mapImportedFlags,
  mapStoredGeneratedImages,
  mergeImportedChunks,
  type ClockData,
} from "../lib/message-transformer";

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageParts: string[];
  isImported: boolean;
  clockData?: ClockData | null;
};

interface ConvexMessage {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: { isImported?: boolean };
}

interface ConvexFile {
  fileType: string;
  messageId?: string;
  blobUrl: string;
}

function mapAiMessageToDisplayMessage(params: {
  msg: UIMessage;
  importedById: Record<string, boolean>;
  persistedImageUrlsByMessageId: Record<string, string[]>;
  storedGeneratedImageUrlsByMessageId: Record<string, string[]>;
}): DisplayMessage {
  const {
    msg,
    importedById,
    persistedImageUrlsByMessageId,
    storedGeneratedImageUrlsByMessageId,
  } = params;

  const textParts = msg.parts.filter(
    (part): part is { type: "text"; text: string } => part.type === "text",
  );
  let content = textParts.map((part) => part.text).join("");

  const searchResults = collectPerplexitySearchResults(msg.parts);
  if (!content.trim() && searchResults.length > 0) {
    content = buildSearchFallbackContent(searchResults);
  }

  const imageParts = collectImageUrlsFromParts(msg.parts);
  if (msg.role === "assistant" && !content.trim() && imageParts.length === 0) {
    content = "_No text was returned for this step. Please retry or switch models._";
  }

  const persisted = persistedImageUrlsByMessageId[msg.id] ?? [];
  const stored = storedGeneratedImageUrlsByMessageId[msg.id] ?? [];
  const resolvedImages = [...new Set([...persisted, ...stored, ...imageParts])];

  const clockData = collectClockDataFromParts(msg.parts);

  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content,
    imageParts: resolvedImages,
    isImported: importedById[msg.id] ?? false,
    clockData,
  };
}

export function useChatMessageTransformer({
  aiMessages,
  dbMessages,
  persistedImageUrlsByMessageId,
  chatFiles,
}: {
  aiMessages: UIMessage[];
  dbMessages: ConvexMessage[] | undefined;
  persistedImageUrlsByMessageId: Record<string, string[]>;
  chatFiles: ConvexFile[] | undefined;
}) {
  const importedById = useMemo(() => mapImportedFlags(dbMessages), [dbMessages]);

  const storedGeneratedImageUrlsByMessageId = useMemo(
    () => mapStoredGeneratedImages(chatFiles),
    [chatFiles],
  );

  const displayMessages = useMemo(() => {
    if (aiMessages.length > 0) {
      return aiMessages
        .filter((msg) => !msg.id.startsWith("import-trigger-"))
        .map((msg) =>
          mapAiMessageToDisplayMessage({
            msg,
            importedById,
            persistedImageUrlsByMessageId,
            storedGeneratedImageUrlsByMessageId,
          }),
        );
    }
    return mergeImportedChunks(
      (dbMessages ?? []).map(
        (message) =>
          ({
            id: message._id,
            role: message.role as "user" | "assistant",
            content: message.content,
            imageParts: storedGeneratedImageUrlsByMessageId[message._id] ?? [],
            isImported: !!message.metadata?.isImported,
          }) satisfies DisplayMessage,
      ),
    );
  }, [
    aiMessages,
    dbMessages,
    importedById,
    persistedImageUrlsByMessageId,
    storedGeneratedImageUrlsByMessageId,
  ]);

  return displayMessages;
}
