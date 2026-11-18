import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useAction, useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { isKaiModel } from "@repo/ai/lib/kai";
import { getModelById } from "@repo/ai/lib/models";
import { getImportStrategy } from "@repo/core/import-strategy";
import { ArrowUpRight, Link2 } from "lucide-react-native";

import { ChatInput } from "@/components/chat/chat-input";
import { useTheme } from "@/components/theme-provider";
import { TopToolbar } from "@/components/top-toolbar";
import {
  DialogClosePill,
  Eyebrow,
  FadeInUp,
  GlassDialog,
} from "@/components/ui/glass";
import { cn } from "@/lib/utils";
import { KontinueLogo } from "@/components/ui/kontinue-logo";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useWebSearchPreference } from "@/hooks/use-web-search-preference";
import {
  pickDocumentAttachments,
  type PendingAttachment,
} from "@/lib/chat-attachments";
import { errorMessage } from "@/lib/app-errors";
import { API_BASE_URL } from "@/lib/chat-api";
import {
  detectProvider,
  MODEL_PROVIDER_MAP,
  PROVIDER_CONFIG,
} from "@/lib/import-providers";
import { savePendingChatDraft } from "@/lib/pending-chat-draft";
import { getFirstName } from "@/lib/user-display";

const STEPS = [
  {
    title: "Start from chat input",
    description: "Type your prompt below. A new conversation opens instantly.",
  },
  {
    title: "Import when needed",
    description: "Use the import button to paste a shared link in a modal.",
  },
  {
    title: "Continue naturally",
    description: "Pick your model and keep going with full context.",
  },
];

export default function HomeScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const router = useRouter();
  const { user } = useUser();
  const firstName = getFirstName(user);

  const { selectedModel, setSelectedModel, isPaidPlan } = useSelectedModel();
  const createChat = useMutation(api.chats.createChat);
  const importViaFirecrawl = useAction(api.firecrawl.importIntoChat);
  const appendImportedMessages = useMutation(api.chats.appendImportedMessagesToChat);
  const appendImportFailure = useMutation(api.chats.appendImportFailureMessageToChat);
  const { getToken } = useAuth();

  const [howOpen, setHowOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState("auto");
  const [imageSize, setImageSize] = useState<string | null>(null);
  // Persisted on the account so it carries into the chat this screen starts,
  // into the next session, and across devices.
  const { webSearchEnabled, toggleWebSearch } = useWebSearchPreference();
  const [agentId, setAgentId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const { isDark, primary, mutedForeground, primaryForeground } = useTheme();
  const webSearchAvailable = isPaidPlan || isKaiModel(selectedModel);
  const detectedProvider = importUrl.trim()
    ? detectProvider(importUrl.trim())
    : "unknown";
  const importProviderMeta = {
    ...PROVIDER_CONFIG[detectedProvider],
    detected: detectedProvider !== "unknown",
  };

  // Dictation fills the composer, same as the chat screen: interim results
  // replace everything after the text present when the mic opened.
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

  const startChatFromPrompt = useCallback(
    async (prompt: string) => {
      if (isCreatingChat || (!prompt.trim() && attachments.length === 0))
        return;
      setIsCreatingChat(true);
      if (voice.isListening) void voice.toggle();
      try {
        const title =
          prompt.trim().slice(0, 60) ||
          attachments[0]?.filename ||
          "New Conversation";
        const model = getModelById(selectedModel);
        const chatId = await createChat({
          title,
          provider: model
            ? (MODEL_PROVIDER_MAP[model.provider] ?? "unknown")
            : "unknown",
          importMethod: "manual",
          messages: [],
        });
        savePendingChatDraft(String(chatId), {
          text: prompt.trim(),
          model: selectedModel,
          webSearchEnabled: webSearchEnabled && webSearchAvailable,
          attachments,
          imageAspectRatio,
          imageSize,
        });
        setAttachments([]);
        // Carry the selected agent into the new chat, mirroring web.
        router.push(
          agentId ? `/chat/${chatId}?agent=${agentId}` : `/chat/${chatId}`,
        );
      } catch (err) {
        toast.error("Couldn't start the chat", {
          description: errorMessage(err, "Please try again."),
        });
      } finally {
        setIsCreatingChat(false);
      }
    },
    [
      agentId,
      attachments,
      createChat,
      imageAspectRatio,
      imageSize,
      isCreatingChat,
      router,
      selectedModel,
      voice,
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
      .catch((err) => {
        toast.error("Couldn't attach file", {
          description: errorMessage(err, "Please try again."),
        });
      });
  }, [attachments.length]);

  const handleImport = useCallback(async () => {
    const sourceUrl = importUrl.trim();
    if (!sourceUrl) return;
    try {
      const parsed = new URL(sourceUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        toast.error("Invalid link", {
          description: "Please enter a valid HTTP/HTTPS URL.",
        });
        return;
      }
    } catch {
      toast.error("Invalid link", { description: "Please enter a valid URL." });
      return;
    }

    setIsImporting(true);
    try {
      const chatId = await createChat({
        title: "Importing conversation...",
        provider: detectProvider(sourceUrl),
        sourceUrl,
        importMethod: "automatic",
        messages: [],
      });

      setImportUrl("");
      setImportOpen(false);

      // Fire-and-forget: the action appends imported messages (or a failure
      // notice) to the chat itself, which streams in live via Convex.
      // Same routing as web's scrapeAndAppendImport: the shared strategy picks
      // the self-hosted scraper or Firecrawl (the scraper kill-switch lives in
      // @repo/core/import-strategy). Fire-and-forget: messages, or a failure
      // notice, land in the chat live via Convex; the toast covers the case
      // where the person has already left the chat.
      const failImport = async (message: string) => {
        await appendImportFailure({ chatId, errorMessage: message }).catch(() => {});
        toast.error("Import failed", { description: message });
      };
      if (getImportStrategy(sourceUrl) === "firecrawl") {
        void importViaFirecrawl({ chatId, url: sourceUrl })
          .then((result) => {
            if (result && !result.success) {
              toast.error("Import failed", {
                description: result.error || "We couldn't import that chat.",
              });
            }
          })
          .catch((err) =>
            failImport(errorMessage(err, "We couldn't import that chat.")),
          );
      } else {
        void (async () => {
          try {
            const token = await getToken();
            const response = await fetch(`${API_BASE_URL}/api/import/scrape`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ url: sourceUrl }),
            });
            const data = (await response.json().catch(() => ({}))) as {
              success?: boolean;
              title?: string;
              messages?: Parameters<typeof appendImportedMessages>[0]["messages"];
              message?: string;
              error?: string;
            };
            if (!response.ok || !data.success || !data.messages) {
              throw new Error(data.message || data.error || "Failed to import chat");
            }
            await appendImportedMessages({
              chatId,
              title: data.title || "Imported Chat",
              messages: data.messages,
            });
          } catch (err) {
            await failImport(errorMessage(err, "Failed to import chat"));
          }
        })();
      }

      router.push(`/chat/${chatId}`);
    } catch (err) {
      toast.error("Import failed", {
        description: errorMessage(err, "Failed to import chat"),
      });
    } finally {
      setIsImporting(false);
    }
  }, [
    appendImportFailure,
    appendImportedMessages,
    createChat,
    getToken,
    importUrl,
    importViaFirecrawl,
    router,
  ]);

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={[]}>
      {/* Ambient background glows matching web */}
      <View
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
      >
        {/* Top Center circular bloom */}
        <View
          style={{
            position: "absolute",
            top: -120,
            left: 0,
            right: 0,
            height: 480,
          }}
        >
          <Svg height={480} width={windowWidth}>
            <Defs>
              <RadialGradient id="topGlow" cx="50%" cy="15%" r="50%">
                <Stop offset="0%" stopColor={primary} stopOpacity={0.16} />
                <Stop offset="100%" stopColor={primary} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50%" cy="15%" r="50%" fill="url(#topGlow)" />
          </Svg>
        </View>

        {/*
         * Bottom Center Input Bloom — spreads up behind the composer.
         *
         * The width is the measured window width, not "100%": a percentage on
         * the root <Svg> inside an `alignItems: center` parent has no definite
         * cross-axis size to resolve against, so `cx="50%"` landed off-centre.
         *
         * There is deliberately no bottom-RIGHT bloom here. Web has room for a
         * corner accent beside the centred one; on a phone the two overlap and
         * read as a single glow pushed to the right edge.
         */}
        <View
          style={{
            position: "absolute",
            bottom: -60,
            left: 0,
            width: windowWidth,
            height: 580,
          }}
        >
          <Svg height={580} width={windowWidth}>
            <Defs>
              <RadialGradient id="inputGlow" cx="50%" cy="65%" r="55%">
                <Stop offset="0%" stopColor={primary} stopOpacity={0.25} />
                <Stop offset="45%" stopColor={primary} stopOpacity={0.12} />
                <Stop offset="100%" stopColor={primary} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50%" cy="65%" r="55%" fill="url(#inputGlow)" />
          </Svg>
        </View>
      </View>

      {/* Floating header pills (web AppShell), above the hero glow */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, zIndex: 30 }}
      >
        <TopToolbar />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Centered hero */}
        <View
          className="items-center justify-center px-6"
          style={{ flex: 1, zIndex: 10, paddingTop: insets.top + 56 }}
        >
          <View
            style={{
              shadowColor: primary,
              shadowOpacity: 0.35,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
          >
            <KontinueLogo height={44} />
          </View>
          
          <Text className="mt-7 text-center text-3xl font-medium tracking-tight text-foreground/85">
            How can I help{"\n"}you, <Text className="text-3xl font-semibold text-foreground">{firstName}</Text>?
          </Text>

          <View className="mt-8 flex-row items-center justify-center gap-4">
            {/*
             * Web draws this as a `border-b` sitting tight under the text.
             * React Native's `textDecorationLine` positions the underline off
             * the font's line box, so with a multiple-of-line-height leading it
             * drifts far below the glyphs. A 1px View gives exact control, the
             * same way the web rule does.
             */}
            <Pressable onPress={() => setHowOpen(true)} hitSlop={6}>
              <Text className="text-[14px] leading-5 text-muted-foreground">
                How does this work?
              </Text>
              <View
                style={{
                  height: 1,
                  marginTop: 1,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.20)"
                    : "rgba(0,0,0,0.20)",
                }}
              />
            </Pressable>

            {/*
             * Mirrors HomeImportDialog's trigger: the FILL is transparent and
             * the BORDER carries the glow. The old version filled the pill with
             * a primary gradient and bloomed a wide outer shadow, which read as
             * a solid frosted button and hid the ring entirely.
             */}
            <Pressable
              onPress={() => setImportOpen(true)}
              style={({ pressed }) => [
                {
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: `${primary}59`,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  backgroundColor: "transparent",
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  // Tight bloom hugging the ring, not a wide halo behind a fill.
                  shadowColor: primary,
                  shadowOpacity: pressed ? 0.35 : 0.22,
                  shadowRadius: 7,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 3,
                },
              ]}
            >
              <Icon as={ArrowUpRight} size={16} className="text-primary" />
              <Text className="text-[14px] font-medium text-foreground">
                Import shared link
              </Text>
            </Pressable>
          </View>

        </View>

        {/* Composer pinned to the bottom */}
        <View
          className="px-4"
          style={{
            zIndex: 20,
            paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 12),
          }}
        >

          {isCreatingChat ? (
            <View className="mb-2 flex-row items-center justify-center gap-2">
              <ActivityIndicator size="small" />
              <Text className="text-[12px] text-muted-foreground">
                Starting chat…
              </Text>
            </View>
          ) : null}

          <ChatInput
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onSend={(text) => void startChatFromPrompt(text)}
            disabled={isCreatingChat}
            isLoading={isCreatingChat}
            webSearchAvailable={webSearchAvailable}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={toggleWebSearch}
            agentId={agentId}
            onAgentChange={setAgentId}
            attachments={attachments}
            onAttachFile={handleAttachFile}
            onRemoveAttachment={(index) =>
              setAttachments((prev) => prev.filter((_, i) => i !== index))
            }
            value={composerValue}
            onChangeText={setComposerValue}
            isListening={voice.isListening}
            onMicPress={handleMicPress}
            imageAspectRatio={imageAspectRatio}
            imageSize={imageSize}
            onImageOptionsChange={(aspect, size) => {
              setImageAspectRatio(aspect);
              setImageSize(size);
            }}
          />
        </View>
      </KeyboardAvoidingView>

      {/* "How it works" — mirrors HowToButton's glass dialog with the
          stepped timeline and staggered fade-in-up animation */}
      <GlassDialog visible={howOpen} onClose={() => setHowOpen(false)}>
        <DialogClosePill onPress={() => setHowOpen(false)} />
        <View className="px-7 pb-8 pt-7">
          <View className="mb-7">
            <Eyebrow>Get started</Eyebrow>
            <Text className="mt-2 text-[24px] font-semibold tracking-tight text-foreground">
              How it works
            </Text>
          </View>

          <View className="relative">
            {/* vertical connector */}
            <LinearGradient
              colors={[
                `${primary}40`,
                "rgba(127,127,127,0.12)",
                "rgba(127,127,127,0.04)",
              ]}
              style={{
                position: "absolute",
                left: 20,
                top: 24,
                bottom: 24,
                width: 1,
              }}
            />
            <View className="gap-5">
              {howOpen
                ? STEPS.map((step, i) => (
                    <FadeInUp key={step.title} delay={i * 60}>
                      <View className="flex-row gap-4">
                        <LinearGradient
                          colors={[`${primary}26`, `${primary}0D`]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          className="h-10 w-10 items-center justify-center rounded-full border border-primary/20"
                          style={{
                            boxShadow: `0 4px 8px ${primary}59`,
                          }}
                        >
                          <Text className="text-[13px] font-semibold text-primary">
                            {String(i + 1).padStart(2, "0")}
                          </Text>
                        </LinearGradient>
                        <View className="flex-1 pt-1.5">
                          <Text className="text-[14.5px] font-medium text-foreground">
                            {step.title}
                          </Text>
                          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground/80">
                            {step.description}
                          </Text>
                        </View>
                      </View>
                    </FadeInUp>
                  ))
                : null}
            </View>
          </View>
        </View>
      </GlassDialog>

      {/* "Import shared link" — mirrors HomeImportDialog: glass, URL input
          with link icon, detected-provider pill with glowing dot */}
      <GlassDialog visible={importOpen} onClose={() => setImportOpen(false)}>
        <DialogClosePill onPress={() => setImportOpen(false)} />
        <View className="px-7 pb-7 pt-7">
          <View className="mb-6">
            <Eyebrow>Import</Eyebrow>
            <Text className="mt-2 text-[24px] font-semibold tracking-tight text-foreground">
              Continue a conversation
            </Text>
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground/85">
              Paste a shared link from ChatGPT, Claude, Gemini, or any supported
              provider. We&apos;ll bring the messages into Kontinue.
            </Text>
          </View>

          {/* URL input — surface-inset with leading link icon */}
          <View className="relative">
            <View className="pointer-events-none absolute left-3.5 top-0 h-full justify-center">
              <Icon as={Link2} size={16} className="text-muted-foreground/70" />
            </View>
            <TextInput
              value={importUrl}
              onChangeText={setImportUrl}
              placeholder="https://chat.openai.com/share/..."
              placeholderTextColor={mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              className="rounded-xl border border-foreground/5 bg-foreground/4 py-3 pl-10 pr-3 text-[14px] text-foreground"
            />
          </View>

          {/* Detected provider */}
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-[10px] font-semibold uppercase tracking-widest text-primary">
              Detected provider
            </Text>
            <View
              className={cn(
                "flex-row items-center gap-1.5 rounded-full border px-2.5 py-1",
                importProviderMeta.detected
                  ? "border-foreground/8 bg-foreground/5"
                  : "border-foreground/5 bg-foreground/3",
              )}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: importProviderMeta.color,
                  ...(importProviderMeta.detected
                    ? {
                        shadowColor: importProviderMeta.color,
                        shadowOpacity: 1,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 0 },
                      }
                    : null),
                }}
              />
              <Text
                className={cn(
                  "text-[11.5px] font-medium",
                  importProviderMeta.detected
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {importProviderMeta.name}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View className="mt-7 flex-row items-center justify-end gap-2">
            <Pressable
              onPress={() => setImportOpen(false)}
              disabled={isImporting}
              className="rounded-full px-4 py-2 active:bg-foreground/5"
            >
              <Text className="text-[13px] font-medium text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              disabled={!importUrl.trim() || isImporting}
              onPress={() => void handleImport()}
              style={({ pressed }) => [
                importUrl.trim() && !isImporting
                  ? {
                      shadowColor: primary,
                      shadowOpacity: 0.45,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 4,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    }
                  : null,
              ]}
              className={
                importUrl.trim() && !isImporting
                  ? "flex-row items-center gap-2 rounded-full bg-primary px-4 py-2"
                  : "flex-row items-center gap-2 rounded-full bg-primary/40 px-4 py-2"
              }
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={primaryForeground} />
              ) : null}
              <Text className="text-[13px] font-semibold text-primary-foreground">
                {isImporting ? "Importing..." : "Import chat"}
              </Text>
            </Pressable>
          </View>
        </View>
      </GlassDialog>
    </SafeAreaView>
  );
}
