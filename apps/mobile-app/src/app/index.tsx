import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { useUser } from "@clerk/expo";
import { useAction, useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { isKaiModel } from "@repo/ai/lib/kai";
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
import { useSelectedModel } from "@/hooks/use-selected-model";
import {
  pickDocumentAttachments,
  type PendingAttachment,
} from "@/lib/chat-attachments";
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

// Mirrors @repo/utils PROVIDER_CONFIG for the detected-provider pill.
const PROVIDER_META: Record<string, { name: string; color: string }> = {
  chatgpt: { name: "ChatGPT", color: "#10a37f" },
  claude: { name: "Claude", color: "#cc785c" },
  gemini: { name: "Gemini", color: "#4285f4" },
  t3chat: { name: "T3Chat", color: "#f8e6f4" },
  perplexity: { name: "Perplexity", color: "#20b8cd" },
  mistral: { name: "Mistral", color: "#9ca3af" },
  unknown: { name: "Unknown", color: "#6b7280" },
};

// Mirrors @repo/utils detectProvider for the few hosts we badge in the
// sidebar (that package's exports map doesn't resolve under Metro).
function detectProvider(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes("chatgpt.com") || host.includes("openai.com"))
      return "chatgpt";
    if (host.includes("claude.ai")) return "claude";
    if (host.includes("gemini.google.com")) return "gemini";
    if (host.includes("perplexity.ai")) return "perplexity";
    if (host.includes("t3.chat")) return "t3chat";
    if (host.includes("mistral.ai")) return "mistral";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export default function HomeScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const { user } = useUser();
  const firstName = getFirstName(user);

  const { selectedModel, setSelectedModel, isPaidPlan } = useSelectedModel();
  const createChat = useMutation(api.chats.createChat);
  const importViaFirecrawl = useAction(api.firecrawl.importIntoChat);

  const [howOpen, setHowOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const { isDark, primary, mutedForeground, primaryForeground } = useTheme();
  const webSearchAvailable = isPaidPlan || isKaiModel(selectedModel);
  const detectedProvider = importUrl.trim()
    ? detectProvider(importUrl.trim())
    : "unknown";
  const importProviderMeta = {
    ...(PROVIDER_META[detectedProvider] ?? PROVIDER_META.unknown!),
    detected: detectedProvider !== "unknown",
  };

  const startChatFromPrompt = useCallback(
    async (prompt: string) => {
      if (isCreatingChat || (!prompt.trim() && attachments.length === 0))
        return;
      setIsCreatingChat(true);
      setErrorText(null);
      try {
        const title =
          prompt.trim().slice(0, 60) ||
          attachments[0]?.filename ||
          "New Conversation";
        const chatId = await createChat({
          title,
          provider: "kontinue",
          importMethod: "manual",
          messages: [],
        });
        savePendingChatDraft(String(chatId), {
          text: prompt.trim(),
          model: selectedModel,
          webSearchEnabled: webSearchEnabled && webSearchAvailable,
          attachments,
        });
        setAttachments([]);
        // Carry the selected agent into the new chat, mirroring web.
        router.push(
          agentId ? `/chat/${chatId}?agent=${agentId}` : `/chat/${chatId}`,
        );
      } catch (err) {
        const data = (err as { data?: { message?: string } })?.data;
        setErrorText(
          data?.message ??
            (err instanceof Error ? err.message : "Failed to start chat"),
        );
      } finally {
        setIsCreatingChat(false);
      }
    },
    [
      agentId,
      attachments,
      createChat,
      isCreatingChat,
      router,
      selectedModel,
      webSearchAvailable,
      webSearchEnabled,
    ],
  );

  const handleAttachFile = useCallback(() => {
    pickDocumentAttachments(attachments.length)
      .then(({ attachments: picked, rejected }) => {
        if (picked.length > 0) setAttachments((prev) => [...prev, ...picked]);
        if (rejected.length > 0) {
          setErrorText(`Some files were skipped: ${rejected.join(", ")}`);
        }
      })
      .catch((err) => {
        setErrorText(
          err instanceof Error ? err.message : "Couldn't attach file.",
        );
      });
  }, [attachments.length]);

  const handleImport = useCallback(async () => {
    const sourceUrl = importUrl.trim();
    if (!sourceUrl) return;
    try {
      const parsed = new URL(sourceUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        setErrorText("Please enter a valid HTTP/HTTPS URL.");
        return;
      }
    } catch {
      setErrorText("Please enter a valid URL.");
      return;
    }

    setIsImporting(true);
    setErrorText(null);
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
      void importViaFirecrawl({ chatId, url: sourceUrl }).catch((err) => {
        console.warn("import failed", err);
      });

      router.push(`/chat/${chatId}`);
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      setErrorText(
        data?.message ??
          (err instanceof Error ? err.message : "Failed to import chat"),
      );
    } finally {
      setIsImporting(false);
    }
  }, [createChat, importUrl, importViaFirecrawl, router]);

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
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

      <TopToolbar />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Centered hero */}
        <View className="items-center justify-center px-6" style={{ flex: 1, zIndex: 10 }}>
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

          {errorText ? (
            <View className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5">
              <Text className="text-[13px] leading-5 text-destructive">
                {errorText}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Composer pinned to the bottom */}
        <View className="px-4 pb-3" style={{ zIndex: 20 }}>

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
            onWebSearchToggle={() => setWebSearchEnabled((prev) => !prev)}
            agentId={agentId}
            onAgentChange={setAgentId}
            attachments={attachments}
            onAttachFile={handleAttachFile}
            onRemoveAttachment={(index) =>
              setAttachments((prev) => prev.filter((_, i) => i !== index))
            }
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
