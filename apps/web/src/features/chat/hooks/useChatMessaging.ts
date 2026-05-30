"use client";

import { useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  getChatErrorToast,
  nonImageAttachments,
  toImageFileUIParts,
  toChatRequestBody,
  trimMessagesToRetryTarget,
  withAttachmentSummary,
} from "../lib/chat-messaging";

interface UseChatMessagingProps {
  chatId: Id<"chats">;
  isPremium: (modelId: string) => boolean;
  addMessage: (args: {
    chatId: Id<"chats">;
    role: "user" | "assistant";
    content: string;
    isPremiumModel?: boolean;
    model?: string;
  }) => Promise<Id<"messages">>;
  updateMessageContent: (args: {
    messageId: Id<"messages">;
    content: string;
  }) => Promise<unknown>;
  deleteMessagesAfter: (args: {
    messageId: Id<"messages">;
    inclusive?: boolean;
  }) => Promise<unknown>;
  /** Convex-side messages, used to resolve AI SDK message IDs to Convex IDs */
  dbMessages: Array<{ _id: Id<"messages"> }> | undefined;
  getState: () => {
    selectedModel: string;
    webSearchEnabled: boolean;
    imageAspectRatio: string;
    imageSize: string | null;
  };
}

type ConvexRateLimitError = {
  data?: { code?: string; message?: string };
};

export function useChatMessaging({
  chatId,
  isPremium,
  addMessage,
  updateMessageContent,
  deleteMessagesAfter,
  dbMessages,
  getState,
}: UseChatMessagingProps) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const chatHelpers = useChat({
    transport,
    experimental_throttle: 50,
    onError: (err) => {
      console.error("AI chat error:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      const toastMessage = getChatErrorToast(msg);
      toast.error(toastMessage.title, { description: toastMessage.description });
    },
  });

  const {
    messages: aiMessages,
    status,
    sendMessage,
    stop,
    setMessages,
    regenerate,
  } = chatHelpers;

  const handleSend = useCallback(
    async (content: string, files?: File[]) => {
      try {
        const state = getState();

        await addMessage({
          chatId,
          role: "user",
          content,
          model: state.selectedModel,
          isPremiumModel: isPremium(state.selectedModel),
        });
        const requestBody = toChatRequestBody(state, chatId);
        const imageFileParts = await toImageFileUIParts(files);
        const nonImageFiles = nonImageAttachments(files);
        const contentWithFiles = withAttachmentSummary(content, nonImageFiles);

        await sendMessage(
          imageFileParts.length > 0
            ? { text: contentWithFiles, files: imageFileParts }
            : { text: contentWithFiles },
          {
            body: requestBody,
          },
        );
      } catch (err: unknown) {
        const convexError = err as ConvexRateLimitError;
        if (convexError.data?.code?.includes("RATE_LIMIT")) {
          toast.error(convexError.data.message);
          return;
        }
        throw err;
      }
    },
    [addMessage, chatId, isPremium, sendMessage, getState],
  );

  const handleRetry = useCallback(
    (id: string, modelOverride?: string) => {
      if (typeof regenerate !== "function") return;
      setMessages((prev: UIMessage[]) => {
        return trimMessagesToRetryTarget(prev, id);
      });
      const state = getState();

      regenerate({
        body: {
          ...toChatRequestBody(state, chatId),
          model: modelOverride ?? state.selectedModel,
        },
      });
    },
    [chatId, regenerate, setMessages, getState],
  );

  const handleEdit = useCallback(
    async (aiMessageId: string, newContent: string) => {
      if (typeof regenerate !== "function") return;
      const trimmed = newContent.trim();
      if (!trimmed) return;

      const idx = aiMessages.findIndex((m) => m.id === aiMessageId);
      if (idx === -1) return;
      const target = aiMessages[idx];
      if (!target || target.role !== "user") return;

      // Resolve Convex doc ID for this user message by index — aiMessages
      // and dbMessages are kept in sync 1:1 by the chat lifecycle.
      const convexId = dbMessages?.[idx]?._id;

      try {
        if (convexId) {
          await updateMessageContent({ messageId: convexId, content: trimmed });
          await deleteMessagesAfter({ messageId: convexId, inclusive: false });
        }
      } catch (err) {
        const convexError = err as ConvexRateLimitError;
        toast.error(
          convexError.data?.message ??
            (err instanceof Error ? err.message : "Failed to save edit"),
        );
        return;
      }

      // Update local AI SDK state: replace text in the edited message,
      // drop everything that came after it. Regenerate produces a fresh
      // assistant response from the edited prompt.
      setMessages((prev: UIMessage[]) => {
        const at = prev.findIndex((m) => m.id === aiMessageId);
        if (at === -1) return prev;
        const original = prev[at];
        if (!original) return prev;
        const otherParts = original.parts.filter((p) => p.type !== "text");
        const updated: UIMessage = {
          ...original,
          parts: [
            ...otherParts,
            { type: "text", text: trimmed },
          ] as UIMessage["parts"],
        };
        return [...prev.slice(0, at), updated];
      });

      const state = getState();
      regenerate({ body: toChatRequestBody(state, chatId) });
    },
    [
      aiMessages,
      chatId,
      dbMessages,
      updateMessageContent,
      deleteMessagesAfter,
      regenerate,
      setMessages,
      getState,
    ],
  );

  return {
    aiMessages,
    status,
    stop,
    setMessages,
    handleSend,
    handleRetry,
    handleEdit,
    sendMessage,
  };
}
