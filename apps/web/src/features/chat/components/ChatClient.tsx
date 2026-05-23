"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { useSidebar } from "@repo/ui/components/ui/sidebar";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";
import { useChatContext } from "../../../providers/ChatProvider";
import {
  getImportFailureMessage,
  getImportProgressFromTitle,
  isImportParamSet,
} from "../lib/import-status";

// Hooks
import { useChatMessageTransformer } from "../hooks/useChatMessageTransformer";
import { useChatPersistence } from "../hooks/useChatPersistence";
import { useChatState } from "../hooks/useChatState";
import { useScrollManagement } from "../hooks/useScrollManagement";
import { useChatMessaging } from "../hooks/useChatMessaging";
import { useChatLifecycle } from "../hooks/useChatLifecycle";
import { useImportParamCleanup } from "../hooks/useImportParamCleanup";
import { isLikelyImageGenerationRequest } from "../lib/generation";

// Components
import { ChatMessageList } from "./ChatMessageList";
import { ChatInputContainer } from "./ChatInputContainer";
import { ChatStatusView } from "./ChatStatusView";
import { ChatImportStatusBanner } from "./ChatImportStatusBanner";

export function ChatClient() {
  return (
    <Suspense fallback={<ChatStatusView chat={undefined} dbMessages={undefined} />}>
      <ChatClientContent />
    </Suspense>
  );
}

function ChatClientContent() {
  const { setChatInfo, clearChatInfo } = useChatContext();
  const { getCapabilities, isProModel } = useModelCapabilities();
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
  const addMessage = useMutation(api.messages.addMessage);
  const updateMessageContent = useMutation(api.messages.updateMessageContent);
  const deleteMessagesAfter = useMutation(api.messages.deleteMessagesAfter);

  // 2. State Management
  const chatState = useChatState({ chatId });

  // 3. Messaging Logic
  const messaging = useChatMessaging({
    chatId,
    isPremium: isProModel,
    addMessage,
    updateMessageContent,
    deleteMessagesAfter,
    dbMessages,
    getState: () => ({
      selectedModel: chatState.selectedModel,
      webSearchEnabled: chatState.webSearchEnabled,
      imageAspectRatio: chatState.imageAspectRatio,
      imageSize: chatState.imageSize,
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
      {memoryStatus?.warning ? (
        <div className="px-4 pt-4 sm:px-6">
          <Alert>
            <AlertTitle>Memory limit reached</AlertTitle>
            <AlertDescription>{memoryStatus.warning}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <div className="flex-1">
        <ChatMessageList
          messages={displayMessages}
          status={status}
          isStreaming={status === "streaming"}
          isGeneratingImage={isGeneratingImage}
          currentModelId={chatState.selectedModel}
          modelOptionsWithAccess={chatState.modelOptionsWithAccess}
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
        onWebSearchToggle={() =>
          chatState.setWebSearchEnabled((prev: boolean) => !prev)
        }
        imageAspectRatio={chatState.imageAspectRatio}
        imageSize={chatState.imageSize}
        onImageAspectRatioChange={chatState.setImageAspectRatio}
        onImageSizeChange={chatState.setImageSize}
      />
    </div>
  );
}
