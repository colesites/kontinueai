"use client";

import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { useSidebar } from "@repo/ui/components/ui/sidebar";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { useChatContext } from "../../../providers/ChatProvider";
import { useChatLifecycle } from "../hooks/useChatLifecycle";

// Hooks
import { useChatMessageTransformer } from "../hooks/useChatMessageTransformer";
import { useChatMessaging } from "../hooks/useChatMessaging";
import { useChatPersistence } from "../hooks/useChatPersistence";
import { useChatState } from "../hooks/useChatState";
import { useImportParamCleanup } from "../hooks/useImportParamCleanup";
import { useScrollManagement } from "../hooks/useScrollManagement";
import { isLikelyImageGenerationRequest } from "../lib/generation";
import {
	getImportFailureMessage,
	getImportProgressFromTitle,
	isImportParamSet,
} from "../lib/import-status";
import { ChatImportStatusBanner } from "./ChatImportStatusBanner";
import { ChatInputContainer } from "./ChatInputContainer";
// Components
import { ChatMessageList } from "./ChatMessageList";
import { ChatStatusView } from "./ChatStatusView";

const MEMORY_LIMIT_ALERT_KEY = "kontinue.memory-limit-alert-shown";

function hasShownMemoryLimitAlert(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return (
			localStorage.getItem(MEMORY_LIMIT_ALERT_KEY) === "true" ||
			sessionStorage.getItem(MEMORY_LIMIT_ALERT_KEY) === "true"
		);
	} catch {
		return false;
	}
}

function markMemoryLimitAlertShown(): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(MEMORY_LIMIT_ALERT_KEY, "true");
		sessionStorage.setItem(MEMORY_LIMIT_ALERT_KEY, "true");
	} catch {
		// Ignore storage quota or restricted access errors
	}
}

function clearMemoryLimitAlertShown(): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.removeItem(MEMORY_LIMIT_ALERT_KEY);
		sessionStorage.removeItem(MEMORY_LIMIT_ALERT_KEY);
	} catch {
		// Ignore storage quota or restricted access errors
	}
}

export function ChatClient() {
	return (
		<Suspense
			fallback={<ChatStatusView chat={undefined} dbMessages={undefined} />}
		>
			<ChatClientContent />
		</Suspense>
	);
}

function ChatClientContent() {
	const { setChatInfo, clearChatInfo } = useChatContext();
	const { getCapabilities, getModelAccessClass } = useModelCapabilities();
	const { state: sidebarState, isMobile: isSidebarMobile } = useSidebar();
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const chatId = params.chatId as Id<"chats">;

	// 1. Data Fetching
	const chat = useQuery(api.chats.getChat, chatId ? { chatId } : "skip");
	const dbMessages = useQuery(
		api.messages.getMessages,
		chatId ? { chatId } : "skip",
	);
	const chatFiles = useQuery(
		api.files.listByChat,
		chatId ? { chatId } : "skip",
	);
	const memoryStatus = useQuery(api.memories.getMemoryStatus, {});

	useEffect(() => {
		if (memoryStatus === undefined) return;
		if (memoryStatus?.warning) {
			if (!hasShownMemoryLimitAlert()) {
				markMemoryLimitAlertShown();
				toast.error("Memory limit reached", {
					id: "memory-limit-warning",
					description: memoryStatus.warning,
					action: {
						label: "Manage",
						onClick: () => router.push("/settings?tab=memory"),
					},
				});
			}
		} else {
			clearMemoryLimitAlertShown();
		}
	}, [memoryStatus, router]);

	const addMessage = useMutation(api.messages.addMessage);
	const updateMessageContent = useMutation(api.messages.updateMessageContent);
	const deleteMessagesAfter = useMutation(api.messages.deleteMessagesAfter);

	// 2. State Management
	const chatState = useChatState({ chatId });

	// Active agent persona for this chat (e.g. arrived from /agents → ?agent=coding).
	// Captured once so it persists for the whole chat session even after the query
	// param is cleaned from the URL.
	const [agentId, setAgentId] = useState<string | null>(() =>
		searchParams.get("agent"),
	);

	// 3. Messaging Logic
	const messaging = useChatMessaging({
		chatId,
		getModelClass: getModelAccessClass,
		addMessage,
		updateMessageContent,
		deleteMessagesAfter,
		dbMessages,
		getState: () => ({
			selectedModel: chatState.selectedModel,
			webSearchEnabled: chatState.webSearchEnabled,
			reasoningEnabled: chatState.reasoningEnabled,
			imageAspectRatio: chatState.imageAspectRatio,
			imageSize: chatState.imageSize,
			agentId,
		}),
	});

	const {
		aiMessages,
		status,
		stop,
		setMessages,
		handleSend,
		handleRetry,
		handleEdit,
	} = messaging;

	const [persistedImageUrlsByMessageId, setPersistedImageUrlsByMessageId] =
		useState<Record<string, string[]>>({});

	const displayMessages = useChatMessageTransformer({
		aiMessages,
		dbMessages,
		persistedImageUrlsByMessageId,
		chatFiles,
	});

	const { persistAssistantTurn } = useChatPersistence({ chatId, dbMessages });
	const {
		messagesEndRef,
		showScrollToBottomButton,
		showScrollToTopButton,
		scrollToBottom,
		scrollToTop,
	} = useScrollManagement(displayMessages);

	// 4. Lifecycle
	useChatLifecycle({
		chat,
		chatId,
		setChatInfo,
		clearChatInfo,
		dbMessages,
		aiMessages,
		setMessages,
		status,
		consumeDraft: chatState.consumeDraft,
		handleSend,
		displayMessages,
		selectedModel: chatState.selectedModel,
		persistAssistantTurn,
		setPersistedImageUrlsByMessageId,
	});

	useImportParamCleanup({
		dbMessages,
		router,
		searchParams,
	});

	if (chat === undefined || chat === null || dbMessages === undefined) {
		return <ChatStatusView chat={chat} dbMessages={dbMessages} />;
	}

	const importFailureMessage = getImportFailureMessage(dbMessages);
	const hasImportParams = isImportParamSet(searchParams);
	const importProgress = hasImportParams
		? getImportProgressFromTitle(chat.title)
		: null;
	const isBackgroundImporting =
		hasImportParams && !importFailureMessage
			? importProgress !== null || dbMessages.length === 0
			: false;

	const isGeneratingImage = isLikelyImageGenerationRequest({
		status,
		selectedModel: chatState.selectedModel,
		getCapabilities,
		displayMessages,
	});

	return (
		<div className="relative flex min-h-full flex-col bg-background">
			<ChatImportStatusBanner
				isBackgroundImporting={isBackgroundImporting}
				importFailureMessage={importFailureMessage}
				importProgress={importProgress}
			/>
			<div className="flex-1">
				<ChatMessageList
					messages={displayMessages}
					status={status}
					isStreaming={status === "streaming"}
					isGeneratingImage={isGeneratingImage}
					currentModelId={chatState.selectedModel}
					modelOptionsWithAccess={chatState.modelOptionsWithAccess}
					reasoningEnabled={chatState.reasoningEnabled}
					onRetry={handleRetry}
					onEdit={handleEdit}
					onSwitchModel={(id, mid) => {
						chatState.setUserSelectedModel(mid);
						handleRetry(id, mid);
					}}
					showScrollToTopButton={showScrollToTopButton}
					showScrollToBottomButton={showScrollToBottomButton}
					onScrollToTop={scrollToTop}
					onScrollToBottom={scrollToBottom}
					messagesEndRef={messagesEndRef}
				/>
			</div>

			<ChatInputContainer
				sidebarState={sidebarState}
				isSidebarMobile={isSidebarMobile}
				showScrollToBottomButton={showScrollToBottomButton}
				showScrollToTopButton={showScrollToTopButton}
				onScrollToBottom={scrollToBottom}
				onScrollToTop={scrollToTop}
				onSend={handleSend}
				isLoading={status === "submitted" || status === "streaming"}
				disabled={isBackgroundImporting}
				onStop={stop}
				selectedModel={chatState.selectedModel}
				onModelChange={(next) => chatState.setUserSelectedModel(next)}
				webSearchEnabled={chatState.webSearchEnabled}
				onWebSearchToggle={chatState.toggleWebSearch}
				reasoningEnabled={chatState.reasoningEnabled}
				onReasoningToggle={chatState.toggleReasoning}
				imageAspectRatio={chatState.imageAspectRatio}
				imageSize={chatState.imageSize}
				onImageAspectRatioChange={chatState.setImageAspectRatio}
				onImageSizeChange={chatState.setImageSize}
				agentId={agentId}
				onAgentChange={setAgentId}
			/>
		</div>
	);
}
