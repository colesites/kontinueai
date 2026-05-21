"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SidebarChat } from "./sidebar-chat-types";

type UseSidebarChatActionsArgs = {
  chats: SidebarChat[] | undefined;
  pathname: string;
};

function getFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useSidebarChatActions({
  chats,
  pathname,
}: UseSidebarChatActionsArgs) {
  const router = useRouter();
  const updateChatTitle = useMutation(api.chats.updateChatTitle);
  const deleteChat = useMutation(api.chats.deleteChat);
  const toggleChatPin = useMutation(api.chats.toggleChatPin);

  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  const [shareChat, setShareChat] = useState<SidebarChat | null>(null);

  useEffect(() => {
    if (!renamingChatId) return;
    const stillExists = (chats ?? []).some((chat) => chat._id === renamingChatId);
    if (!stillExists) {
      setRenamingChatId(null);
      setRenameValue("");
    }
  }, [chats, renamingChatId]);

  const closeRename = () => {
    setRenamingChatId(null);
    setRenameValue("");
  };

  const startRename = (chat: SidebarChat) => {
    setRenamingChatId(chat._id);
    setRenameValue(chat.title);
  };

  const handleRenameSubmit = async (chat: SidebarChat) => {
    const nextTitle = renameValue.trim();
    if (!nextTitle) {
      toast.error("Chat title cannot be empty.");
      return;
    }
    if (nextTitle === chat.title.trim()) {
      closeRename();
      return;
    }

    setBusyChatId(chat._id);
    try {
      await updateChatTitle({ chatId: chat._id, title: nextTitle });
      toast.success("Chat renamed.");
      closeRename();
    } catch (error) {
      toast.error(getFriendlyError(error, "Could not rename chat."));
    } finally {
      setBusyChatId(null);
    }
  };

  const handleTogglePin = async (chat: SidebarChat) => {
    const willPin = !chat.pinnedAt;
    setBusyChatId(chat._id);
    try {
      await toggleChatPin({ chatId: chat._id, pinned: willPin });
      toast.success(willPin ? "Chat pinned." : "Chat unpinned.");
    } catch (error) {
      toast.error(getFriendlyError(error, "Could not update chat pin."));
    } finally {
      setBusyChatId(null);
    }
  };

  const handleDelete = async (chat: SidebarChat) => {
    const confirmed = window.confirm(
      `Delete "${chat.title.trim() || "this chat"}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusyChatId(chat._id);
    try {
      await deleteChat({ chatId: chat._id });
      if (pathname === `/chat/${chat._id}`) {
        router.push("/");
      }
      toast.success("Chat deleted.");
    } catch (error) {
      toast.error(getFriendlyError(error, "Could not delete chat."));
    } finally {
      setBusyChatId(null);
    }
  };

  return {
    renamingChatId,
    renameValue,
    busyChatId,
    shareChat,
    setRenameValue,
    setShareChat,
    closeRename,
    startRename,
    handleRenameSubmit,
    handleTogglePin,
    handleDelete,
  };
}
