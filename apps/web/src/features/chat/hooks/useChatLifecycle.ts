"use client";

import { useEffect } from "react";
import { Id } from "@repo/convex/convex/_generated/dataModel";
import { DisplayMessage } from "./useChatMessageTransformer";
import { UIMessage } from "ai";

interface UseChatLifecycleProps {
  chat: { title?: string } | null | undefined;
  chatId: Id<"chats">;
  setChatInfo: (id: Id<"chats">, title: string) => void;
  clearChatInfo: () => void;
  dbMessages: Array<{ _id: string; role: "user" | "assistant" | "system"; content: string }> | undefined;
  aiMessages: UIMessage[];
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  status: string;
  consumeDraft: (onSend: (text: string) => void) => void;
  handleSend: (content: string, files?: File[]) => Promise<void>;
  displayMessages: DisplayMessage[];
  selectedModel: string;
  persistAssistantTurn: (args: {
    lastMessage: UIMessage;
    displayMessage: DisplayMessage;
    selectedModel: string;
    onImagesPersisted: (urls: string[]) => void;
  }) => void;
  setPersistedImageUrlsByMessageId: (
    update: (prev: Record<string, string[]>) => Record<string, string[]>,
  ) => void;
}

export function useChatLifecycle({
  chat,
  chatId,
  setChatInfo,
  clearChatInfo,
  dbMessages,
  aiMessages,
  setMessages,
  status,
  consumeDraft,
  handleSend,
  displayMessages,
  selectedModel,
  persistAssistantTurn,
  setPersistedImageUrlsByMessageId,
}: UseChatLifecycleProps) {
  useEffect(() => {
    if (chat && chatId) setChatInfo(chatId, chat.title || "Untitled Chat");
    return () => clearChatInfo();
  }, [chat, chatId, setChatInfo, clearChatInfo]);

  useEffect(() => {
    if (dbMessages && aiMessages.length === 0) {
      setMessages(
        dbMessages.map((m) => ({
          id: m._id,
          role: m.role,
          parts: [{ type: "text" as const, text: m.content }],
        })),
      );
    }
  }, [dbMessages, aiMessages.length, setMessages]);

  useEffect(() => {
    if (status === "ready") consumeDraft(handleSend);
  }, [status, consumeDraft, handleSend]);

  useEffect(() => {
    if (status !== "ready" || aiMessages.length === 0) return;
    const last = aiMessages[aiMessages.length - 1];
    if (!last || last.role !== "assistant") return;

    const display = displayMessages.find((m) => m.id === last.id);
    if (display) {
      persistAssistantTurn({
        lastMessage: last,
        displayMessage: display,
        selectedModel,
        onImagesPersisted: (urls: string[]) =>
          setPersistedImageUrlsByMessageId((p) => ({
            ...p,
            [last.id]: urls,
          })),
      });
    }
  }, [
    status,
    aiMessages,
    displayMessages,
    selectedModel,
    persistAssistantTurn,
    setPersistedImageUrlsByMessageId,
  ]);
}
