import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share as NativeShare,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { isKaiModel } from "@repo/ai/lib/kai";
import {
  collectAttachmentsFromParts,
  collectClockDataFromParts,
  collectEmailDraftFromParts,
  collectGeneratedFilesFromParts,
  collectImageUrlsFromParts,
  collectTextFromParts,
  mapImportedFlags,
  mapStoredGeneratedImages,
  pickGeneratedImages,
  splitReasoningFromParts,
} from "@repo/core/chat-message-parts";
import {
  buildSearchFallbackContent,
  collectPerplexitySearchResults,
} from "@repo/core/chat-search-results";
import {
  type ChatErrorKind,
  getChatErrorKind,
  getChatErrorToast,
} from "@repo/core/chat-request";
import {
  ArrowDown,
  Check,
  CircleAlert,
  Copy,
  ListTree,
  Share as ShareIcon,
  Share2,
  Sparkles,
} from "lucide-react-native";

import { ChatInput } from "@/components/chat/chat-input";
import {
  ChatMessage,
  type DisplayMessage,
} from "@/components/chat/chat-message";
import { ModelSelector } from "@/components/chat/model-selector";
import { withAlpha } from "@/components/chat/markdown";
import { useTheme } from "@/components/theme-provider";
import { ToolbarButton, TopToolbar } from "@/components/top-toolbar";
import {
  DialogClosePill,
  Eyebrow,
  GlassDialog,
  GlassView,
} from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { useReasoningPreference } from "@/hooks/use-reasoning-preference";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useWebSearchPreference } from "@/hooks/use-web-search-preference";
import { errorMessage } from "@/lib/app-errors";
import {
  API_BASE_URL,
  CHAT_API_URL,
  streamingFetch,
  toChatRequestBody,
  trimMessagesToRetryTarget,
} from "@/lib/chat-api";
import {
  pickDocumentAttachments,
  toFileUIParts,
  type PendingAttachment,
} from "@/lib/chat-attachments";
import { consumePendingChatDraft } from "@/lib/pending-chat-draft";
import { cn } from "@/lib/utils";

const EMPTY_STREAMING_MESSAGE: DisplayMessage = {
  id: "streaming-placeholder",
  role: "assistant",
  content: "",
  images: [],
  attachments: [],
  isImported: false,
  clockData: null,
  emailDraft: null,
  generatedFiles: [],
};

// Shown once per app session, like web's once-per-browser memory alert.
let memoryAlertShown = false;

function toDisplayMessage(
  message: UIMessage,
  importedById: Record<string, boolean>,
  storedImagesById: Record<string, string[]>,
): DisplayMessage {
  const isUser = message.role === "user";
  const split = splitReasoningFromParts(message.parts);
  let content = split.content;
  if (!isUser && !content.trim()) {
    const searchResults = collectPerplexitySearchResults(message.parts);
    if (searchResults.length > 0) {
      content = buildSearchFallbackContent(searchResults);
    }
  }
  return {
    id: message.id,
    role: isUser ? "user" : "assistant",
    content,
    reasoningText: isUser ? undefined : split.reasoningText,
    images: isUser
      ? []
      : pickGeneratedImages(
          collectImageUrlsFromParts(message.parts),
          [],
          storedImagesById[message.id] ?? [],
        ),
    attachments: isUser ? collectAttachmentsFromParts(message.parts) : [],
    isImported: importedById[message.id] ?? false,
    clockData: isUser ? null : collectClockDataFromParts(message.parts),
    emailDraft: isUser ? null : collectEmailDraftFromParts(message.parts),
    generatedFiles: isUser ? [] : collectGeneratedFilesFromParts(message.parts),
  };
}

type ChatErrorState = {
  title: string;
  description: string;
  kind: ChatErrorKind;
};

function toChatError(message: string): ChatErrorState {
  return { ...getChatErrorToast(message), kind: getChatErrorKind(message) };
}

export default function ConversationScreen() {
  const { id, agent } = useLocalSearchParams<{ id: string; agent?: string }>();
  const chatId = id as Id<"chats">;
  const router = useRouter();
  // Agent persona for this chat (arrived from /agents or picked in the "+"
  // menu) — sent with every request, mirroring ChatClient on web.
  const [agentId, setAgentId] = useState<string | null>(() =>
    typeof agent === "string" && agent.length > 0 ? agent : null,
  );
  const { getToken } = useAuth();
  const { selectedModel, setSelectedModel, isPaidPlan } = useSelectedModel();
  const { reasoningEnabled } = useReasoningPreference();

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
  const createFileRecord = useMutation(api.files.createFileRecord);
  const updateMessageContent = useMutation(api.messages.updateMessageContent);
  const deleteMessagesAfter = useMutation(api.messages.deleteMessagesAfter);

  const [chatError, setChatError] = useState<ChatErrorState | null>(null);
  // Persisted on the account: survives leaving the chat, force-quitting the
  // app, and follows the user to their other devices.
  const { webSearchEnabled, toggleWebSearch } = useWebSearchPreference();
  // Mirrors web gating: paid plans use the gateway search tool; K-AI has its
  // own server-side search pipeline so it's available on every tier.
  const webSearchAvailable = isPaidPlan || isKaiModel(selectedModel);
  const [imageAspectRatio, setImageAspectRatio] = useState("auto");
  const [imageSize, setImageSize] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [editTarget, setEditTarget] = useState<DisplayMessage | null>(null);
  const [editValue, setEditValue] = useState("");
  const [switchTarget, setSwitchTarget] = useState<DisplayMessage | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [turnsOpen, setTurnsOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showJumpControls, setShowJumpControls] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Header pills and the composer float over the conversation (web parity):
  // the list scrolls underneath them and pads itself by their measured size.
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [composerHeight, setComposerHeight] = useState(140);
  const keyboardOpen = useKeyboardOpen();
  // Follow the stream only while the reader is already at the bottom; once
  // they scroll up to read, new tokens must not yank them back down.
  const followBottomRef = useRef(true);
  const turnOffsetsRef = useRef(new Map<string, number>());

  // Web shows this once as a toast linking to the memory settings.
  useEffect(() => {
    if (!memoryStatus?.warning || memoryAlertShown) return;
    memoryAlertShown = true;
    toast.error("Memory limit reached", {
      id: "memory-limit-warning",
      description: memoryStatus.warning,
      duration: 8000,
      action: {
        label: "Manage memory",
        onPress: () => router.push("/settings?tab=memory" as Href),
      },
    });
  }, [memoryStatus, router]);

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
      setChatError(
        toChatError(
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong on our end.",
        ),
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

  const requestBody = useCallback(
    (
      model: string,
      search: boolean,
      imageOptions?: { aspectRatio: string; size: string | null },
    ) =>
      toChatRequestBody(
        {
          selectedModel: model,
          webSearchEnabled: search,
          reasoningEnabled,
          imageAspectRatio: imageOptions?.aspectRatio ?? imageAspectRatio,
          imageSize: imageOptions ? imageOptions.size : imageSize,
          agentId,
        },
        chatId,
      ),
    [agentId, chatId, imageAspectRatio, imageSize, reasoningEnabled],
  );

  const scrollToBottom = useCallback((animated = true) => {
    followBottomRef.current = true;
    setShowJumpControls(false);
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  const handleSend = useCallback(
    async (
      content: string,
      modelOverride?: string,
      webSearchOverride?: boolean,
      attachmentsOverride?: PendingAttachment[],
      imageOptions?: { aspectRatio: string; size: string | null },
    ) => {
      const model = modelOverride ?? selectedModel;
      const files = toFileUIParts(attachmentsOverride ?? attachments);
      const search =
        (webSearchOverride ?? webSearchEnabled) && webSearchAvailable;
      setChatError(null);
      setAttachments([]);
      scrollToBottom();
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
          { body: requestBody(model, search, imageOptions) },
        );
      } catch (err) {
        setChatError(toChatError(errorMessage(err, "Failed to send message")));
      }
    },
    [
      addMessage,
      attachments,
      chatId,
      requestBody,
      scrollToBottom,
      selectedModel,
      sendMessage,
      webSearchAvailable,
      webSearchEnabled,
    ],
  );

  const handleAttachFile = useCallback(() => {
    pickDocumentAttachments(attachments.length)
      .then(({ attachments: picked, rejected }) => {
        if (picked.length > 0) setAttachments((prev) => [...prev, ...picked]);
        if (rejected.length > 0) {
          toast.error("Some files were skipped", {
            description: rejected.join("\n"),
          });
        }
      })
      .catch((err) =>
        toast.error("Couldn't attach file", {
          description: errorMessage(err, "Please try again."),
        }),
      );
  }, [attachments.length]);

  // Retry an assistant turn: trim local state back to the originating user
  // message and regenerate (mirrors handleRetry on web). Passing a model
  // switches to it first, like web's "Switch model" retry option.
  const handleRetry = useCallback(
    (messageId: string, modelOverride?: string) => {
      const model = modelOverride ?? selectedModel;
      if (modelOverride) setSelectedModel(modelOverride);
      setChatError(null);
      setMessages((prev) => trimMessagesToRetryTarget(prev, messageId));
      scrollToBottom();
      void regenerate({
        body: requestBody(model, webSearchEnabled && webSearchAvailable),
      });
    },
    [
      regenerate,
      requestBody,
      scrollToBottom,
      selectedModel,
      setMessages,
      setSelectedModel,
      webSearchAvailable,
      webSearchEnabled,
    ],
  );

  // Retry the turn that just failed (no assistant message may exist yet).
  const handleRetryLast = useCallback(
    (modelOverride?: string) => {
      const lastAssistant = [...aiMessages]
        .reverse()
        .find((m) => m.role === "assistant");
      const lastUserIndex = aiMessages.findLastIndex((m) => m.role === "user");
      if (lastAssistant && aiMessages.indexOf(lastAssistant) > lastUserIndex) {
        handleRetry(lastAssistant.id, modelOverride);
        return;
      }
      const model = modelOverride ?? selectedModel;
      if (modelOverride) setSelectedModel(modelOverride);
      setChatError(null);
      void regenerate({
        body: requestBody(model, webSearchEnabled && webSearchAvailable),
      });
    },
    [
      aiMessages,
      handleRetry,
      regenerate,
      requestBody,
      selectedModel,
      setSelectedModel,
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
    if (!target || !trimmed || trimmed === target.content.trim()) return;

    const index = aiMessages.findIndex((m) => m.id === target.id);
    if (index === -1) return;
    // Hydrated messages carry their Convex id; fresh ones stay 1:1 with
    // dbMessages after hydration, so resolve those by position.
    const convexId =
      dbMessages?.find((m) => m._id === target.id)?._id ??
      dbMessages?.[index]?._id;
    try {
      if (convexId) {
        await updateMessageContent({ messageId: convexId, content: trimmed });
        await deleteMessagesAfter({ messageId: convexId, inclusive: false });
      }
    } catch (err) {
      setChatError(toChatError(errorMessage(err, "Failed to save edit")));
      return;
    }

    setChatError(null);
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
    scrollToBottom();
    void regenerate({
      body: requestBody(selectedModel, webSearchEnabled && webSearchAvailable),
    });
  }, [
    aiMessages,
    dbMessages,
    deleteMessagesAfter,
    editTarget,
    editValue,
    regenerate,
    requestBody,
    scrollToBottom,
    selectedModel,
    setMessages,
    updateMessageContent,
    webSearchAvailable,
    webSearchEnabled,
  ]);

  const sendPendingDraft = useEffectEvent(
    (draft: ReturnType<typeof consumePendingChatDraft>) => {
      if (!draft) return;
      // The preference is persisted on the account, so this screen already
      // reads the value the home screen wrote. The draft still carries it for
      // the send itself.
      // Image options chosen on the home composer carry into this chat.
      const imageOptions =
        draft.imageAspectRatio !== undefined
          ? { aspectRatio: draft.imageAspectRatio, size: draft.imageSize ?? null }
          : undefined;
      if (imageOptions) {
        setImageAspectRatio(imageOptions.aspectRatio);
        setImageSize(imageOptions.size);
      }
      void handleSend(
        draft.text,
        draft.model,
        draft.webSearchEnabled,
        draft.attachments,
        imageOptions,
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
      // Deferred so the send (and its state updates) runs outside the effect.
      const timer = setTimeout(() => sendPendingDraft(draft), 0);
      return () => clearTimeout(timer);
    }
  }, [chatId, status, dbMessages]);

  const importedById = useMemo(() => mapImportedFlags(dbMessages), [dbMessages]);
  const storedImagesById = useMemo(
    () => mapStoredGeneratedImages(chatFiles),
    [chatFiles],
  );
  const displayMessages = useMemo(
    () =>
      aiMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => toDisplayMessage(m, importedById, storedImagesById)),
    [aiMessages, importedById, storedImagesById],
  );

  // Persist the assistant reply to Convex when a stream completes (mirrors
  // useChatPersistence on web). The dbMessages check skips imported /
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
    const display = toDisplayMessage(last, importedById, storedImagesById);
    const generatedImages = display.images.filter((uri) =>
      uri.startsWith("data:"),
    );
    // Same fallbacks as web: an image-only or search-only turn still saves,
    // otherwise it vanishes on reload.
    const content =
      collectTextFromParts(last.parts).trim() ||
      display.content.trim() ||
      (generatedImages.length ? "Generated image." : "");
    if (!content) return;
    lastSavedAssistantIdRef.current = last.id;
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
              const extension = blob.type.includes("png")
                ? "png"
                : blob.type.includes("jpeg")
                  ? "jpg"
                  : "webp";
              const filename = `generated-${messageId}-${index}.${extension}`;
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
    importedById,
    selectedModel,
    storedImagesById,
  ]);

  const isStreaming = status === "submitted" || status === "streaming";
  const lastMessage = displayMessages[displayMessages.length - 1];
  const streamingMessageId =
    status === "streaming" && lastMessage?.role === "assistant"
      ? lastMessage.id
      : null;
  const showPendingBubble =
    status === "submitted" ||
    (status === "streaming" && lastMessage?.role !== "assistant");

  const turns = displayMessages
    .filter((m) => m.role === "user")
    .map((m) => ({
      id: m.id,
      preview:
        m.content.replace(/\s+/g, " ").trim().slice(0, 90) ||
        (m.attachments[0]?.filename ?? "Attachment"),
    }));

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
  const isEmptyChat =
    chat !== null &&
    dbMessages !== undefined &&
    displayMessages.length === 0 &&
    !isStreaming &&
    !isBackgroundImporting;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    const nearBottom = distanceFromBottom < 96;
    followBottomRef.current = nearBottom;
    const shouldShow =
      !nearBottom && contentSize.height > layoutMeasurement.height * 1.25;
    if (shouldShow !== showJumpControls) setShowJumpControls(shouldShow);
  };

  const jumpToTurn = (turnId: string) => {
    setTurnsOpen(false);
    const y = turnOffsetsRef.current.get(turnId);
    if (y === undefined) return;
    followBottomRef.current = false;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
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
    <View className="bg-background" style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* The composer is absolutely placed in this flex child (not in the
            KeyboardAvoidingView itself), so it rides up with the keyboard. */}
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerClassName="px-4"
            contentContainerStyle={{
              paddingTop: headerHeight + 4,
              paddingBottom: composerHeight + 20,
            }}
            scrollIndicatorInsets={{ top: headerHeight, bottom: composerHeight }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={handleScroll}
            scrollEventThrottle={64}
            onContentSizeChange={() => {
              if (followBottomRef.current) {
                scrollRef.current?.scrollToEnd({ animated: true });
              }
            }}
          >
            {chat === null ? (
              <ChatNotFound onHome={() => router.replace("/")} />
            ) : isEmptyChat ? (
              <View className="items-center px-6 py-20">
                <View className="h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12">
                  <Icon as={Sparkles} size={20} className="text-primary" />
                </View>
                <Text className="mt-4 text-center text-[17px] font-semibold text-foreground">
                  {shareTitle}
                </Text>
                <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted-foreground">
                  Ask anything below to start this conversation.
                </Text>
              </View>
            ) : (
              displayMessages.map((message) => (
                <View
                  key={message.id}
                  onLayout={(event) => {
                    turnOffsetsRef.current.set(
                      message.id,
                      event.nativeEvent.layout.y,
                    );
                  }}
                >
                  <ChatMessage
                    message={message}
                    isStreaming={message.id === streamingMessageId}
                    actionsHidden={isStreaming}
                    reasoningEnabled={reasoningEnabled}
                    onEdit={(target) => {
                      setEditValue(target.content);
                      setEditTarget(target);
                    }}
                    onRetry={(target) => handleRetry(target.id)}
                    onSwitchModel={(target) => setSwitchTarget(target)}
                  />
                </View>
              ))
            )}

            {showPendingBubble ? (
              <ChatMessage
                message={EMPTY_STREAMING_MESSAGE}
                isStreaming
                actionsHidden
                reasoningEnabled={reasoningEnabled}
              />
            ) : null}

            {chatError ? (
              <ChatErrorCard
                error={chatError}
                onDismiss={() => setChatError(null)}
                onRetry={() => handleRetryLast()}
                onSwitchModel={() =>
                  setSwitchTarget({ ...EMPTY_STREAMING_MESSAGE, id: "__last__" })
                }
                onUpgrade={() => router.push("/pricing" as Href)}
              />
            ) : null}
          </ScrollView>

          {showJumpControls && turns.length > 0 ? (
            <JumpControls
              bottom={composerHeight + 10}
              turnCount={turns.length}
              onOpenTurns={() => setTurnsOpen(true)}
              onScrollToBottom={() => scrollToBottom()}
            />
          ) : null}

          {/* Floating composer over a soft fade, like web's docked glass input */}
          <View
            pointerEvents="box-none"
            onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 12,
              paddingTop: 10,
              paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 10),
            }}
          >
            <LinearGradient
              pointerEvents="none"
              colors={[
                withAlpha(tokens.background, 0),
                withAlpha(tokens.background, 0.85),
                tokens.background,
              ]}
              locations={[0, 0.45, 1]}
              style={{ position: "absolute", left: 0, right: 0, top: -24, bottom: 0 }}
            />
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
              onWebSearchToggle={toggleWebSearch}
              agentId={agentId}
              onAgentChange={setAgentId}
              imageAspectRatio={imageAspectRatio}
              imageSize={imageSize}
              onImageOptionsChange={(aspect, size) => {
                setImageAspectRatio(aspect);
                setImageSize(size);
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Floating header: glass pills over a fade, content scrolls beneath */}
      <View
        pointerEvents="box-none"
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[tokens.background, withAlpha(tokens.background, 0.8), withAlpha(tokens.background, 0)]}
          locations={[0, 0.55, 1]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: -16 }}
        />
        <TopToolbar
          rightSlot={
            <ToolbarButton
              label="Share chat"
              icon={ShareIcon}
              onPress={() => setShareOpen(true)}
              disabled={!chat}
            />
          }
        />
        {isBackgroundImporting ? (
          <ImportProgressBanner
            percent={importProgress.percent}
            stage={importProgress.stage}
          />
        ) : importFailure ? (
          <View className="mx-4 mt-1 flex-row items-start gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-3">
            <Icon as={CircleAlert} size={16} className="mt-0.5 text-destructive" />
            <Text className="flex-1 text-[12.5px] leading-5 text-destructive">
              Import failed: {importFailure}
            </Text>
          </View>
        ) : null}
      </View>

      <ShareChatDialog
        visible={shareOpen}
        title={shareTitle}
        url={shareUrl}
        copied={copySuccess}
        onClose={() => setShareOpen(false)}
        onCopy={() => void handleCopyShareLink()}
        onNativeShare={() => void handleNativeShare()}
      />

      <TurnsDialog
        visible={turnsOpen}
        turns={turns}
        onClose={() => setTurnsOpen(false)}
        onJump={jumpToTurn}
        onTop={() => {
          setTurnsOpen(false);
          followBottomRef.current = false;
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }}
        onBottom={() => {
          setTurnsOpen(false);
          scrollToBottom();
        }}
      />

      {/* "Switch model" retry — web opens the shared model selector. */}
      <ModelSelector
        visible={switchTarget !== null}
        onClose={() => setSwitchTarget(null)}
        selectedModel={selectedModel}
        onSelect={(modelId) => {
          const target = switchTarget;
          setSwitchTarget(null);
          if (!target) return;
          if (target.id === "__last__") handleRetryLast(modelId);
          else handleRetry(target.id, modelId);
        }}
      />

      <EditMessageDialog
        visible={editTarget !== null}
        value={editValue}
        original={editTarget?.content ?? ""}
        onChange={setEditValue}
        onClose={() => setEditTarget(null)}
        onSave={() => void handleEditSave()}
      />
    </View>
  );
}

/* ─── Pieces ───────────────────────────────────────────────────────────── */

function ImportProgressBanner({
  percent,
  stage,
}: {
  percent: number;
  stage: string;
}) {
  return (
    <View className="mx-4 mt-1 rounded-2xl border border-primary/25 bg-primary/8 px-3.5 py-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[12.5px] font-semibold text-primary">
          Importing conversation · {percent}%
        </Text>
        <Text numberOfLines={1} className="flex-1 text-right text-[11px] text-primary/80">
          {stage}
        </Text>
      </View>
      <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </View>
    </View>
  );
}

function ChatNotFound({ onHome }: { onHome: () => void }) {
  return (
    <View className="items-center px-6 py-20">
      <View className="h-12 w-12 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5">
        <Icon as={CircleAlert} size={20} className="text-muted-foreground" />
      </View>
      <Text className="mt-4 text-center text-[16px] font-semibold text-foreground">
        Chat not found
      </Text>
      <Text className="mt-1.5 text-center text-[13px] leading-5 text-muted-foreground">
        This chat doesn&apos;t exist or you don&apos;t have access to it.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onHome}
        className="mt-5 rounded-full bg-primary px-5 py-2.5 active:opacity-90"
      >
        <Text className="text-[13px] font-semibold text-primary-foreground">
          Start a new chat
        </Text>
      </Pressable>
    </View>
  );
}

/** Web shows these as toasts; inline keeps the fix next to the failed turn. */
function ChatErrorCard({
  error,
  onDismiss,
  onRetry,
  onSwitchModel,
  onUpgrade,
}: {
  error: ChatErrorState;
  onDismiss: () => void;
  onRetry: () => void;
  onSwitchModel: () => void;
  onUpgrade: () => void;
}) {
  const upgrade = error.kind === "plan" || error.kind === "limit";
  const switchModel =
    error.kind === "model" || error.kind === "busy" || error.kind === "plan";
  const retry = !upgrade && error.kind !== "too-long" && error.kind !== "auth";
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      className="mt-2 rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3.5"
    >
      <View className="flex-row items-start gap-2.5">
        <Icon as={CircleAlert} size={16} className="mt-0.5 text-destructive" />
        <View className="flex-1">
          <Text className="text-[13.5px] font-semibold text-foreground">
            {error.title}
          </Text>
          <Text className="mt-0.5 text-[12.5px] leading-[18px] text-muted-foreground">
            {error.description}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row flex-wrap items-center gap-2 pl-6">
        {upgrade ? (
          <ErrorAction label="View plans" primary onPress={onUpgrade} />
        ) : null}
        {retry ? <ErrorAction label="Try again" primary={!upgrade} onPress={onRetry} /> : null}
        {switchModel ? (
          <ErrorAction label="Switch model" onPress={onSwitchModel} />
        ) : null}
        <ErrorAction label="Dismiss" subtle onPress={onDismiss} />
      </View>
    </Animated.View>
  );
}

function ErrorAction({
  label,
  onPress,
  primary = false,
  subtle = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  subtle?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        "min-h-8 items-center justify-center rounded-full px-3.5",
        primary
          ? "bg-primary active:opacity-90"
          : subtle
            ? "active:bg-foreground/6"
            : "border border-foreground/10 bg-foreground/5 active:bg-foreground/10",
      )}
    >
      <Text
        className={cn(
          "text-[12px] font-semibold",
          primary
            ? "text-primary-foreground"
            : subtle
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Native MobileChatTurnNavigator: prompt list + jump to latest. */
function JumpControls({
  bottom,
  turnCount,
  onOpenTurns,
  onScrollToBottom,
}: {
  bottom: number;
  turnCount: number;
  onOpenTurns: () => void;
  onScrollToBottom: () => void;
}) {
  const { isDark } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      pointerEvents="box-none"
      className="absolute left-0 right-0 items-center"
      style={{ bottom }}
    >
      <GlassView
        intensity={45}
        style={{
          borderRadius: 999,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
          backgroundColor: isDark ? "rgba(12,9,12,0.72)" : "rgba(255,251,253,0.85)",
        }}
        className="flex-row items-center p-1"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Jump to a prompt (${turnCount})`}
          onPress={onOpenTurns}
          className="h-9 flex-row items-center gap-1.5 rounded-full px-3 active:bg-foreground/8"
        >
          <Icon as={ListTree} size={14} className="text-muted-foreground" />
          <Text className="text-[12px] font-medium text-foreground">
            {turnCount} {turnCount === 1 ? "prompt" : "prompts"}
          </Text>
        </Pressable>
        <View className="h-5 w-px bg-foreground/10" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scroll to latest"
          onPress={onScrollToBottom}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-foreground/8"
        >
          <Icon as={ArrowDown} size={16} className="text-foreground" />
        </Pressable>
      </GlassView>
    </Animated.View>
  );
}

function TurnsDialog({
  visible,
  turns,
  onClose,
  onJump,
  onTop,
  onBottom,
}: {
  visible: boolean;
  turns: { id: string; preview: string }[];
  onClose: () => void;
  onJump: (id: string) => void;
  onTop: () => void;
  onBottom: () => void;
}) {
  return (
    <GlassDialog visible={visible} onClose={onClose}>
      <DialogClosePill onPress={onClose} />
      <View className="px-5 pb-5 pt-6">
        <Eyebrow>Navigate</Eyebrow>
        <Text className="mt-1.5 text-[20px] font-semibold tracking-tight text-foreground">
          Jump to a prompt
        </Text>
        <ScrollView className="mt-4" style={{ maxHeight: 360 }}>
          <View className="gap-1">
            {turns.map((turn, index) => (
              <Pressable
                key={turn.id}
                accessibilityRole="button"
                onPress={() => onJump(turn.id)}
                className="flex-row items-start gap-3 rounded-xl px-2.5 py-2.5 active:bg-foreground/6"
              >
                <View className="h-6 min-w-6 items-center justify-center rounded-full bg-primary/12 px-1.5">
                  <Text className="text-[11px] font-semibold text-primary">
                    {index + 1}
                  </Text>
                </View>
                <Text
                  numberOfLines={2}
                  className="flex-1 text-[13.5px] leading-5 text-foreground"
                >
                  {turn.preview}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={onTop}
            className="h-10 flex-1 items-center justify-center rounded-xl border border-foreground/8 bg-foreground/4 active:bg-foreground/8"
          >
            <Text className="text-[13px] font-medium text-foreground">Top</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onBottom}
            className="h-10 flex-1 items-center justify-center rounded-xl bg-primary active:opacity-90"
          >
            <Text className="text-[13px] font-semibold text-primary-foreground">
              Latest
            </Text>
          </Pressable>
        </View>
      </View>
    </GlassDialog>
  );
}

function EditMessageDialog({
  visible,
  value,
  original,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  original: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { mutedForeground } = useTheme();
  const canSave = value.trim().length > 0 && value.trim() !== original.trim();
  return (
    <GlassDialog visible={visible} onClose={onClose}>
      <DialogClosePill onPress={onClose} />
      <View className="px-5 pb-5 pt-6">
        <Eyebrow>Edit</Eyebrow>
        <Text className="mt-1.5 text-[20px] font-semibold tracking-tight text-foreground">
          Edit message
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          autoFocus
          placeholder="Edit your message…"
          placeholderTextColor={mutedForeground}
          className="mt-4 max-h-56 min-h-24 rounded-xl border border-foreground/5 bg-foreground/4 px-3.5 py-3 text-[15px] leading-[22px] text-foreground"
          textAlignVertical="top"
        />
        <Text className="mt-2 text-[11.5px] leading-4 text-muted-foreground">
          Messages after this one are removed and the reply is regenerated.
        </Text>
        <View className="mt-5 flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="rounded-full px-4 py-2.5 active:bg-foreground/5"
          >
            <Text className="text-[13px] font-medium text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!canSave}
            onPress={onSave}
            className={cn(
              "rounded-full px-4 py-2.5",
              canSave ? "bg-primary active:opacity-90" : "bg-primary/40",
            )}
          >
            <Text className="text-[13px] font-semibold text-primary-foreground">
              Save & regenerate
            </Text>
          </Pressable>
        </View>
      </View>
    </GlassDialog>
  );
}

/** Web ShareModal: glass panel, inset link field, glowing copy button. */
function ShareChatDialog({
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
  const { primary } = useTheme();
  return (
    <GlassDialog visible={visible} onClose={onClose}>
      <DialogClosePill onPress={onClose} />
      <View className="px-5 pb-5 pt-6">
        <Eyebrow>Share</Eyebrow>
        <Text
          numberOfLines={2}
          className="mt-1.5 pr-10 text-[20px] font-semibold leading-7 tracking-tight text-foreground"
        >
          {title}
        </Text>
        <Text className="mt-1 text-[12.5px] leading-[18px] text-muted-foreground">
          Anyone with the link can read this conversation.
        </Text>

        <View className="mt-4 flex-row items-center gap-2 rounded-xl border border-foreground/5 bg-foreground/4 p-1.5 pl-3">
          <Text numberOfLines={1} className="flex-1 text-[13px] text-foreground/80">
            {url}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? "Copied link" : "Copy link"}
            onPress={onCopy}
            className="h-9 flex-row items-center gap-1.5 rounded-lg bg-primary px-3 active:opacity-90"
            style={{
              shadowColor: primary,
              shadowOpacity: 0.35,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            <Icon
              as={copied ? Check : Copy}
              size={14}
              className="text-primary-foreground"
            />
            <Text className="text-[12.5px] font-semibold text-primary-foreground">
              {copied ? "Copied" : "Copy"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share via"
          onPress={onNativeShare}
          className="mt-3 h-11 flex-row items-center justify-center gap-2 rounded-xl border border-foreground/8 bg-foreground/3 active:bg-foreground/8"
        >
          <Icon as={Share2} size={16} className="text-foreground" />
          <Text className="text-[13.5px] font-semibold text-foreground">
            Share via…
          </Text>
        </Pressable>
      </View>
    </GlassDialog>
  );
}
