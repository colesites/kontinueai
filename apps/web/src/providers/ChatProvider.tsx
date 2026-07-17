"use client";

import React, {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

interface ChatContextValue {
	chatId: string | null;
	chatTitle: string | null;
	setChatInfo: (chatId: string, chatTitle: string) => void;
	clearChatInfo: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({
	children,
}: {
	children: ReactNode;
}): React.JSX.Element {
	const [chatId, setChatId] = useState<string | null>(null);
	const [chatTitle, setChatTitle] = useState<string | null>(null);

	const setChatInfo = useCallback((id: string, title: string) => {
		setChatId(id);
		setChatTitle(title);
	}, []);

	const clearChatInfo = useCallback(() => {
		setChatId(null);
		setChatTitle(null);
	}, []);

	const value = useMemo(
		() => ({ chatId, chatTitle, setChatInfo, clearChatInfo }),
		[chatId, chatTitle, setChatInfo, clearChatInfo],
	);

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
	const context = useContext(ChatContext);
	if (context === undefined) {
		throw new Error("useChatContext must be used within a ChatProvider");
	}
	return context;
}
