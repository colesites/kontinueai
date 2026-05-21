"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";

interface ChatContextValue {
  chatId: string | null;
  chatTitle: string | null;
  setChatInfo: (chatId: string, chatTitle: string) => void;
  clearChatInfo: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);

  const setChatInfo = (id: string, title: string) => {
    setChatId(id);
    setChatTitle(title);
  };

  const clearChatInfo = () => {
    setChatId(null);
    setChatTitle(null);
  };

  return (
    <ChatContext.Provider
      value={{ chatId, chatTitle, setChatInfo, clearChatInfo }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}
