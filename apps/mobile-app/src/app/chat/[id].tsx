import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share as NativeShare,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { isKaiModel } from "@repo/ai/lib/kai";
import {
  Check,
  Copy,
  FileText,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share as ShareIcon,
  Share2,
  type LucideIcon,
  X,
} from "lucide-react-native";

import { ChatInput } from "@/components/chat/chat-input";
import { ClockWidget } from "@/components/chat/clock-widget";
import {
  EmailComposer,
  type EmailDraft,
} from "@/components/chat/email-composer";
import { Markdown } from "@/components/chat/markdown";
import { ModeToggle } from "@/components/mode-toggle";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useVoiceInput } from "@/hooks/use-voice-input";
import {
  API_BASE_URL,
  CHAT_API_URL,
  streamingFetch,
  toChatRequestBody,
} from "@/lib/chat-api";
import {
  pickDocumentAttachments,
  toFileUIParts,
  type PendingAttachment,
} from "@/lib/chat-attachments";
import { consumePendingChatDraft } from "@/lib/pending-chat-draft";
import { cn } from "@/lib/utils";

function uiMessageText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function uiMessageImages(message: UIMessage): string[] {
  const images: string[] = [];
  for (const part of message.parts) {
    if (
      part.type === "file" &&
      part.mediaType?.startsWith("image/") &&
      part.url
    ) {
      images.push(part.url);
      continue;
    }
    const toolPart = part as unknown as {
      type: string;
      toolName?: string;
      output?: {
        result?: string;
        images?: (string | { base64?: string })[];
      };
      result?: string;
    };
    if (
      toolPart.type === "tool-image_generation" ||
      (toolPart.type === "tool-result" &&
        toolPart.toolName === "image_generation")
    ) {
      const first = toolPart.output?.images?.[0];
      const base64 =
        toolPart.output?.result ??
        toolPart.result ??
        (typeof first === "string" ? first : first?.base64);
      if (base64) images.push(`data:image/webp;base64,${base64}`);
    }
  }
  return images;
}

function uiMessageClockTimezone(message: UIMessage): string | null | undefined {
  for (const part of message.parts) {
    const toolPart = part as unknown as {
      type: string;
      output?: { timezone?: string | null };
    };
    if (toolPart.type === "tool-get_current_time" && toolPart.output) {
      return toolPart.output.timezone ?? null;
    }
  }
  return undefined;
}

function uiMessageEmailDraft(message: UIMessage): EmailDraft | null {
  let draft: EmailDraft | null = null;
  for (const part of message.parts) {
    const toolPart = part as unknown as {
      type: string;
      output?: Partial<EmailDraft>;
    };
    if (
      toolPart.type === "tool-compose_email" &&
      typeof toolPart.output?.subject === "string"
    ) {
      draft = {
        to: toolPart.output.to ?? "",
        cc: toolPart.output.cc ?? "",
        subject: toolPart.output.subject,
        body: toolPart.output.body ?? "",
      };
    }
  }
  return draft;
}

function uiMessageDocuments(message: UIMessage): {
  filename: string;
  url: string;
}[] {
  return message.parts
    .filter(
      (
        part,
      ): part is {
        type: "file";
        mediaType: string;
        url: string;
        filename?: string;
      } => part.type === "file" && !part.mediaType?.startsWith("image/"),
    )
    .map((part) => ({
      filename: part.filename ?? "Attachment",
      url: part.url,
    }));
}

/** Mirrors trimMessagesToRetryTarget in apps/web chat-messaging.ts. */
function trimMessagesToRetryTarget(
  messages: UIMessage[],
  retryMessageId: string,
): UIMessage[] {
  const targetIndex = messages.findIndex((m) => m.id === retryMessageId);
  const userIndex = messages
    .slice(0, targetIndex)
    .findLastIndex((m) => m.role === "user");
  return userIndex === -1 ? messages : messages.slice(0, userIndex + 1);
}

export default function ConversationScreen() {
  const { id, agent } = useLocalSearchParams<{ id: string; agent?: string }>();
  const chatId = id as Id<"chats">;
  const router = useRouter();
  const { openSidebar } = useSidebar();
  // Agent persona for this chat (arrived from /agents or picked in the "+"
  // menu) — sent with every request, mirroring ChatClient on web.
  const [agentId, setAgentId] = useState<string | null>(() =>
    typeof agent === "string" && agent.length > 0 ? agent : null,
  );
  const { getToken } = useAuth();
  const { selectedModel, setSelectedModel, isPaidPlan } = useSelectedModel();

  const chat = useQuery(api.chats.getChat, chatId ? { chatId } : "skip");
  const dbMessages = useQuery(
    api.messages.getMessages,
    chatId ? { chatId } : "skip",
  );
  const chatFiles = useQuery(
    api.files.listByChat,
    chatId ? { chatId } : "skip",
  );
  const addMessage = useMutation(api.messages.addMessage);
  const createFileRecord = useMutation(api.files.createFileRecord);
  const updateMessageContent = useMutation(api.messages.updateMessageContent);
  const deleteMessagesAfter = useMutation(api.messages.deleteMessagesAfter);

  const [sendError, setSendError] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  // Mirrors web gating: paid plans use the gateway search tool; K-AI has its
  // own server-side search pipeline so it's available on every tier.
  const webSearchAvailable = isPaidPlan || isKaiModel(selectedModel);
  const [composerValue, setComposerValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [actionTarget, setActionTarget] = useState<UIMessage | null>(null);
  const [editTarget, setEditTarget] = useState<UIMessage | null>(null);
  const [editValue, setEditValue] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Voice input writes into the composer: interim results replace everything
  // after the text that was present when the mic was opened.
  const voicePrefixRef = useRef("");
  const handleVoiceTranscript = useCallback((transcript: string) => {
    const prefix = voicePrefixRef.current;
    setComposerValue(prefix ? `${prefix} ${transcript}` : transcript);
  }, []);
  const voice = useVoiceInput(handleVoiceTranscript);
  const handleMicPress = () => {
    if (!voice.isListening) voicePrefixRef.current = composerValue.trim();
    void voice.toggle();
  };

  // Streaming transport against the web app's /api/chat. RN's fetch can't
  // stream, so we hand the AI SDK expo/fetch and attach the Clerk session
  // token per request — the web route authenticates Bearer tokens from the
  // same Clerk instance.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API_URL,
        fetch: streamingFetch,
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const token = await getToken();
          return {
            headers: { Authorization: `Bearer ${token}` },
            body: { ...body, messages },
          };
        },
      }),
    [getToken],
  );

  const {
    messages: aiMessages,
    status,
    sendMessage,
    stop,
    setMessages,
    regenerate,
  } = useChat({
    transport,
    experimental_throttle: 80,
    onError: (err) => {
      console.error("AI chat error:", err);
      setSendError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.",
      );
    },
  });

  // Hydrate AI SDK state from Convex history once it arrives.
  useEffect(() => {
    if (
      dbMessages &&
      dbMessages.length > 0 &&
      chatFiles !== undefined &&
      aiMessages.length === 0
    ) {
      setMessages(
        dbMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            const persistedFiles = chatFiles
              .filter((file) => file.messageId === m._id)
              .map((file) => ({
                type: "file" as const,
                mediaType: file.contentType,
                filename: file.filename,
                url: file.blobUrl,
              }));
            return {
              id: m._id,
              role: m.role as "user" | "assistant",
              parts: [
                { type: "text" as const, text: m.content },
                ...persistedFiles,
              ],
            };
          }),
      );
    }
  }, [dbMessages, chatFiles, aiMessages.length, setMessages]);

  const handleSend = useCallback(
    async (
      content: string,
      modelOverride?: string,
      webSearchOverride?: boolean,
      attachmentsOverride?: PendingAttachment[],
    ) => {
      const model = modelOverride ?? selectedModel;
      const files = toFileUIParts(attachmentsOverride ?? attachments);
      const search =
        (webSearchOverride ?? webSearchEnabled) && webSearchAvailable;
      setSendError(null);
      setAttachments([]);
      try {
        await addMessage({
          chatId,
          role: "user",
          content: content || "(attachment)",
          model,
        });
        await sendMessage(
          files.length > 0
            ? { text: content || "Please look at the attached file(s).", files }
            : { text: content },
          {
            body: toChatRequestBody({
              chatId,
              model,
              agentId,
              webSearchEnabled: search,
            }),
          },
        );
      } catch (err) {
        const data = (err as { data?: { message?: string } })?.data;
        setSendError(
          data?.message ??
            (err instanceof Error ? err.message : "Failed to send message"),
        );
      }
    },
    [
      addMessage,
      agentId,
      attachments,
      chatId,
      selectedModel,
      sendMessage,
      webSearchAvailable,
      webSearchEnabled,
    ],
  );

  const attachFail = (err: unknown) =>
    Alert.alert(
      "Couldn't attach file",
      err instanceof Error ? err.message : "Please try again.",
    );

  const handleAttachFile = useCallback(() => {
    pickDocumentAttachments(attachments.length)
      .then(({ attachments: picked, rejected }) => {
        if (picked.length > 0) setAttachments((prev) => [...prev, ...picked]);
        if (rejected.length > 0) {
          Alert.alert("Some files were skipped", rejected.join("\n"));
        }
      })
      .catch(attachFail);
  }, [attachments.length]);

  // Retry an assistant turn: trim local state back to the originating user
  // message and regenerate (mirrors handleRetry on web).
  const handleRetry = useCallback(
    (messageId: string) => {
      setMessages((prev) => trimMessagesToRetryTarget(prev, messageId));
      regenerate({
        body: toChatRequestBody({
          chatId,
          model: selectedModel,
          agentId,
          webSearchEnabled: webSearchEnabled && webSearchAvailable,
        }),
      });
    },
    [
      agentId,
      chatId,
      regenerate,
      selectedModel,
      setMessages,
      webSearchAvailable,
      webSearchEnabled,
    ],
  );

  // Edit a user message: update Convex, drop everything after it, replace the
  // local text and regenerate (mirrors handleEdit on web).
  const handleEditSave = useCallback(async () => {
    const target = editTarget;
    const trimmed = editValue.trim();
    setEditTarget(null);
    if (!target || !trimmed) return;

    const index = aiMessages.findIndex((m) => m.id === target.id);
    if (index === -1) return;
    // aiMessages and dbMessages stay 1:1 after hydration, so resolve the
    // Convex doc by position.
    const convexId = dbMessages?.[index]?._id;
    try {
      if (convexId) {
        await updateMessageContent({ messageId: convexId, content: trimmed });
        await deleteMessagesAfter({ messageId: convexId, inclusive: false });
      }
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      setSendError(data?.message ?? "Failed to save edit");
      return;
    }

    setMessages((prev) => {
      const at = prev.findIndex((m) => m.id === target.id);
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
    regenerate({
      body: toChatRequestBody({
        chatId,
        model: selectedModel,
        agentId,
        webSearchEnabled: webSearchEnabled && webSearchAvailable,
      }),
    });
  }, [
    agentId,
    aiMessages,
    chatId,
    dbMessages,
    deleteMessagesAfter,
    editTarget,
    editValue,
    regenerate,
    selectedModel,
    setMessages,
    updateMessageContent,
    webSearchAvailable,
    webSearchEnabled,
  ]);

  const sendPendingDraft = useEffectEvent(
    (draft: ReturnType<typeof consumePendingChatDraft>) => {
      if (!draft) return;
      if (draft.webSearchEnabled) setWebSearchEnabled(true);
      void handleSend(
        draft.text,
        draft.model,
        draft.webSearchEnabled,
        draft.attachments,
      );
    },
  );

  // First prompt handed off from the home composer.
  const draftConsumedRef = useRef(false);
  useEffect(() => {
    if (draftConsumedRef.current || !chatId || status !== "ready") return;
    if (dbMessages === undefined) return;
    const draft = consumePendingChatDraft(chatId);
    draftConsumedRef.current = true;
    if (draft) {
      // The home screen already persisted draft.model as the default, so
      // selectedModel converges on its own — just send with the override.
      // Deferred so the send (and its state updates) runs outside the effect.
      const timer = setTimeout(() => sendPendingDraft(draft), 0);
      return () => clearTimeout(timer);
    }
  }, [chatId, status, dbMessages]);

  // Persist the assistant reply to Convex when a stream completes (mirrors
  // useChatPersistence on web, text only). dbMessages check skips imported /
  // already-stored history that was hydrated above.
  const lastSavedAssistantIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready" || aiMessages.length === 0) return;
    const last = aiMessages[aiMessages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (lastSavedAssistantIdRef.current === last.id) return;
    if (dbMessages?.some((m) => m._id === last.id)) {
      lastSavedAssistantIdRef.current = last.id;
      return;
    }
    const content = uiMessageText(last).trim();
    if (!content) return;
    lastSavedAssistantIdRef.current = last.id;
    const generatedImages = uiMessageImages(last);
    addMessage({
      chatId,
      role: "assistant",
      content,
      model: selectedModel,
    })
      .then(async (messageId) => {
        const token = generatedImages.length ? await getToken() : null;
        await Promise.all(
          generatedImages.map(async (source, index) => {
            try {
              if (!token) return;
              const sourceResponse = await fetch(source);
              const blob = await sourceResponse.blob();
              const filename = `generated-${messageId}-${index}.${blob.type.includes("png") ? "png" : "webp"}`;
              const uploadResponse = await fetch(
                `${API_BASE_URL}/api/files/upload?filename=${encodeURIComponent(filename)}`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": blob.type || "image/webp",
                  },
                  body: blob,
                },
              );
              const uploaded = (await uploadResponse.json()) as {
                error?: string;
                url: string;
                pathname: string;
                filename: string;
                contentType: string;
                size: number;
              };
              if (!uploadResponse.ok) {
                throw new Error(uploaded.error ?? "Image upload failed.");
              }
              await createFileRecord({
                chatId,
                messageId,
                blobUrl: uploaded.url,
                pathname: uploaded.pathname,
                filename: uploaded.filename,
                contentType: uploaded.contentType,
                size: uploaded.size,
                fileType: "generated-image",
              });
            } catch (error) {
              console.error("failed to persist generated image", error);
            }
          }),
        );
      })
      .catch((err) => {
        lastSavedAssistantIdRef.current = null;
        console.error("failed to persist assistant message", err);
      });
  }, [
    status,
    aiMessages,
    dbMessages,
    addMessage,
    chatId,
    createFileRecord,
    getToken,
    selectedModel,
  ]);

  const isStreaming = status === "submitted" || status === "streaming";
  const importFailure =
    dbMessages
      ?.find(
        (message) =>
          message.metadata?.isImported &&
          message.content.startsWith("Import failed:"),
      )
      ?.content.replace(/^Import failed:\s*/i, "") ?? null;
  const importMatch = chat?.title
    ?.replace(/\s+/g, " ")
    .trim()
    .match(/^Importing\s+(\d{1,3})%\s*(?:[·-]\s*(.+))?$/i);
  const importProgress = chat?.title?.toLowerCase().startsWith("importing")
    ? {
        percent: importMatch
          ? Math.max(1, Math.min(99, Number(importMatch[1]) || 1))
          : 5,
        stage: importMatch?.[2]?.trim() || "Preparing import",
      }
    : null;
  const isBackgroundImporting = !!importProgress && !importFailure;
  const shareUrl = `${API_BASE_URL}/share/${chatId}`;
  const shareTitle = chat?.title?.trim() || "Conversation";

  const openActions = (message: UIMessage) => {
    if (isStreaming) return;
    setActionTarget(message);
  };

  const handleCopyShareLink = async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleNativeShare = async () => {
    try {
      await NativeShare.share(
        Platform.OS === "ios"
          ? { title: shareTitle, url: shareUrl }
          : { title: shareTitle, message: shareUrl },
      );
    } catch (err) {
      if (err instanceof Error) console.error("Share failed:", err);
    }
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ChatFloatingHeader
        onOpenSidebar={openSidebar}
        onSearch={openSidebar}
        onNewChat={() => router.push("/")}
        onShare={() => setShareOpen(true)}
        canShare={Boolean(chat)}
      />
      {isBackgroundImporting ? (
        <View className="mx-3 mt-2 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2.5">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-[12px] font-semibold text-primary">
              Import in progress ({importProgress.percent}%)
            </Text>
            <Text className="text-[10.5px] text-primary/80">
              {importProgress.stage}
            </Text>
          </View>
          <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${importProgress.percent}%` }}
            />
          </View>
        </View>
      ) : importFailure ? (
        <View className="mx-3 mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <Text className="text-[12px] leading-5 text-destructive">
            Import failed: {importFailure}
          </Text>
        </View>
      ) : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerClassName="px-4 py-3 gap-3"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {chat === null ? (
            <View className="items-center py-16">
              <Text className="text-[14px] text-muted-foreground">
                This chat doesn&apos;t exist or you don&apos;t have access to
                it.
              </Text>
            </View>
          ) : (
            aiMessages.map((m) => {
              const text = uiMessageText(m);
              const images = uiMessageImages(m);
              const documents = uiMessageDocuments(m);
              const clockTimezone = uiMessageClockTimezone(m);
              const emailDraft = uiMessageEmailDraft(m);
              if (
                !text.trim() &&
                images.length === 0 &&
                documents.length === 0 &&
                clockTimezone === undefined &&
                !emailDraft
              )
                return null;
              const isUser = m.role === "user";
              return (
                <Pressable
                  key={m.id}
                  onLongPress={() => openActions(m)}
                  delayLongPress={350}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                    isUser
                      ? "self-end bg-primary"
                      : "self-start border border-border bg-card",
                  )}
                >
                  {images.length > 0 ? (
                    <View className="mb-2 flex-row flex-wrap gap-2">
                      {images.map((uri) => (
                        <Image
                          key={uri.slice(0, 64)}
                          source={{ uri }}
                          style={{ width: 140, height: 140, borderRadius: 12 }}
                          contentFit="cover"
                        />
                      ))}
                    </View>
                  ) : null}
                  {documents.length > 0 ? (
                    <View className="mb-1.5 gap-1.5">
                      {documents.map((document) => (
                        <View
                          key={document.url}
                          className={cn(
                            "flex-row items-center gap-2 rounded-lg px-2.5 py-1.5",
                            isUser
                              ? "bg-primary-foreground/15"
                              : "bg-secondary",
                          )}
                        >
                          <Icon
                            as={FileText}
                            size={13}
                            className={
                              isUser
                                ? "text-primary-foreground"
                                : "text-muted-foreground"
                            }
                          />
                          <Text
                            numberOfLines={1}
                            className={cn(
                              "flex-1 text-[12px]",
                              isUser
                                ? "text-primary-foreground"
                                : "text-foreground",
                            )}
                          >
                            {document.filename}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {isUser ? (
                    text.trim() ? (
                      <Text className="text-[15px] leading-6 text-primary-foreground">
                        {text}
                      </Text>
                    ) : null
                  ) : (
                    <>
                      {text.trim() ? <Markdown>{text}</Markdown> : null}
                      {clockTimezone !== undefined ? (
                        <ClockWidget timezone={clockTimezone} />
                      ) : null}
                      {emailDraft ? <EmailComposer draft={emailDraft} /> : null}
                    </>
                  )}
                </Pressable>
              );
            })
          )}

          {status === "submitted" ? (
            <View className="max-w-[85%] self-start rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <Text className="text-[15px] leading-6 text-muted-foreground">
                …
              </Text>
            </View>
          ) : null}

          {sendError ? (
            <View className="self-stretch rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5">
              <Text className="text-[13px] leading-5 text-destructive">
                {sendError}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="px-3 pb-2 pt-1">
          {isStreaming ? (
            <Pressable
              onPress={() => stop()}
              className="mb-2 self-center rounded-full border border-border bg-card px-4 py-1.5 active:opacity-80"
            >
              <Text className="text-[12px] font-medium text-muted-foreground">
                Stop generating
              </Text>
            </Pressable>
          ) : null}
          <ChatInput
            placeholder="Reply…"
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onSend={(text) => void handleSend(text)}
            disabled={isStreaming || isBackgroundImporting || chat === null}
            isLoading={isStreaming}
            onStop={() => stop()}
            value={composerValue}
            onChangeText={setComposerValue}
            attachments={attachments}
            onAttachFile={handleAttachFile}
            onRemoveAttachment={(index) =>
              setAttachments((prev) => prev.filter((_, i) => i !== index))
            }
            isListening={voice.isListening}
            onMicPress={handleMicPress}
            webSearchAvailable={webSearchAvailable}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={() => setWebSearchEnabled((prev) => !prev)}
            agentId={agentId}
            onAgentChange={setAgentId}
          />
        </View>
      </KeyboardAvoidingView>

      <ShareChatModal
        visible={shareOpen}
        title={shareTitle}
        url={shareUrl}
        copied={copySuccess}
        onClose={() => setShareOpen(false)}
        onCopy={() => void handleCopyShareLink()}
        onNativeShare={() => void handleNativeShare()}
      />

      {/* Message actions */}
      <Modal
        visible={actionTarget !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setActionTarget(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl border border-b-0 border-border bg-popover px-3 pb-8 pt-3"
          >
            <ActionRow
              icon={Copy}
              label="Copy"
              onPress={() => {
                const target = actionTarget;
                setActionTarget(null);
                if (target)
                  void Clipboard.setStringAsync(uiMessageText(target));
              }}
            />
            {actionTarget?.role === "user" ? (
              <ActionRow
                icon={Pencil}
                label="Edit message"
                onPress={() => {
                  const target = actionTarget;
                  setActionTarget(null);
                  if (target) {
                    setEditValue(uiMessageText(target));
                    setEditTarget(target);
                  }
                }}
              />
            ) : null}
            {actionTarget?.role === "assistant" ? (
              <ActionRow
                icon={RefreshCw}
                label="Retry"
                onPress={() => {
                  const target = actionTarget;
                  setActionTarget(null);
                  if (target) handleRetry(target.id);
                }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit message dialog */}
      <Modal
        visible={editTarget !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setEditTarget(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 px-6"
          onPress={() => setEditTarget(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-popover p-5"
          >
            <Text className="mb-3 text-[16px] font-semibold text-foreground">
              Edit message
            </Text>
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              multiline
              autoFocus
              className="max-h-48 min-h-20 rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] leading-5 text-foreground"
            />
            <Text className="mt-2 text-[11.5px] leading-4 text-muted-foreground">
              Messages after this one will be removed and the response
              regenerated.
            </Text>
            <View className="mt-4 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setEditTarget(null)}
                className="rounded-full px-4 py-2.5 active:bg-accent"
              >
                <Text className="text-[13px] font-medium text-muted-foreground">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                disabled={!editValue.trim()}
                onPress={() => void handleEditSave()}
                className={
                  editValue.trim()
                    ? "rounded-full bg-primary px-4 py-2.5 active:opacity-90"
                    : "rounded-full bg-primary/40 px-4 py-2.5"
                }
              >
                <Text className="text-[13px] font-semibold text-primary-foreground">
                  Save & regenerate
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ChatFloatingHeader({
  onOpenSidebar,
  onSearch,
  onNewChat,
  onShare,
  canShare,
}: {
  onOpenSidebar: () => void;
  onSearch: () => void;
  onNewChat: () => void;
  onShare: () => void;
  canShare: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between px-3 py-2">
      <View className="flex-row items-center gap-1 rounded-2xl border border-border bg-background/40 p-1">
        <FloatingHeaderButton
          label="Open sidebar"
          icon={PanelLeft}
          onPress={onOpenSidebar}
        />
        <FloatingHeaderButton
          label="Search chats"
          icon={Search}
          onPress={onSearch}
        />
        <FloatingHeaderButton
          label="Start new chat"
          icon={Plus}
          onPress={onNewChat}
        />
      </View>

      <View className="flex-row items-center gap-1 rounded-2xl border border-border bg-background/40 p-1">
        <FloatingHeaderButton
          label="Share chat"
          icon={ShareIcon}
          onPress={onShare}
          disabled={!canShare}
        />
        <ModeToggle />
      </View>
    </View>
  );
}

function FloatingHeaderButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={cn(
        "h-9 w-9 items-center justify-center rounded-full active:bg-foreground/8",
        disabled && "opacity-40",
      )}
    >
      <Icon as={icon} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

function ShareChatModal({
  visible,
  title,
  url,
  copied,
  onClose,
  onCopy,
  onNativeShare,
}: {
  visible: boolean;
  title: string;
  url: string;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onNativeShare: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/55 px-6"
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-border bg-popover p-5 shadow-xl"
        >
          <View className="mb-4 flex-row items-start justify-between gap-3">
            <Text
              numberOfLines={2}
              className="flex-1 text-[18px] font-semibold leading-6 text-foreground"
            >
              Share {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close share dialog"
              hitSlop={6}
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full active:bg-accent"
            >
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
          </View>

          <View className="flex-row gap-2">
            <TextInput
              value={url}
              editable={false}
              selectTextOnFocus
              className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-secondary px-3 text-[14px] text-foreground"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copied ? "Copied link" : "Copy link"}
              onPress={onCopy}
              className="h-12 flex-row items-center gap-2 rounded-xl bg-secondary px-3 active:opacity-85"
            >
              <Icon
                as={copied ? Check : Copy}
                size={17}
                className="text-foreground"
              />
              <Text className="text-[14px] font-semibold text-foreground">
                {copied ? "Copied!" : "Copy Link"}
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share via"
            onPress={onNativeShare}
            className="mt-3 h-12 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-background/40 active:bg-accent"
          >
            <Icon as={Share2} size={17} className="text-foreground" />
            <Text className="text-[14px] font-semibold text-foreground">
              Share via...
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
}: {
  icon: typeof Copy;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl px-3 py-3.5 active:bg-accent"
    >
      <Icon as={icon} size={17} className="text-muted-foreground" />
      <Text className="text-[14.5px] font-medium text-foreground">{label}</Text>
    </Pressable>
  );
}
