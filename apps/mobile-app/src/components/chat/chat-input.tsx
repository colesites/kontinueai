import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import {
  Bot,
  ArrowUp,
  Brain,
  ImageIcon,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Mic,
  MicOff,
  Paperclip,
  Plug,
  Plus,
  Square,
  X,
} from "lucide-react-native";
import { AGENTS } from "@repo/ai/lib/agents";
import { AVAILABLE_MODELS } from "@repo/ai/lib/models";
import { isKaiModel } from "@repo/ai/lib/kai";
import {
  getSupportedImageOptions,
  IMAGE_ASPECT_OPTIONS,
  IMAGE_SIZE_OPTIONS,
} from "@repo/core/chat-image-options";
import { useModelCapabilities } from "@repo/core/use-model-capabilities";

import {
  ModelSelector,
  ModelSelectorTrigger,
} from "@/components/chat/model-selector";
import { GlassView } from "@/components/ui/glass";
import { GlowButton } from "@/components/ui/glow-button";
import { GlowRail } from "@/components/ui/glow-rail";
import { withAlpha } from "@/components/chat/markdown";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  useDropdown,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import type { PendingAttachment } from "@/lib/chat-attachments";
import { useIsProPlan } from "@/hooks/use-plan-tier";
import { useReasoningPreference } from "@/hooks/use-reasoning-preference";
import { ConnectorLogo, connectorDef } from "@/components/connectors/catalog";
import { applyMention, detectMention } from "@repo/core/chat-mentions";
import { softShadow } from "@/lib/shadow";

const connectorName = (provider: string) =>
  connectorDef(provider)?.name ?? provider;

type ChatInputProps = {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  onStop?: () => void;
  /** Controlled value (used by voice input); falls back to internal state. */
  value?: string;
  onChangeText?: (text: string) => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  attachments?: PendingAttachment[];
  onAttachFile?: () => void;
  onRemoveAttachment?: (index: number) => void;
  isListening?: boolean;
  onMicPress?: () => void;
  /** Web search toggle — lives inside the "+" menu, mirroring web. */
  webSearchAvailable?: boolean;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: () => void;
  /** Agent persona switcher in the "+" menu (drill-in, like web). */
  agentId?: string | null;
  onAgentChange?: (agentId: string | null) => void;
  /**
   * Image aspect / size for image-generation models (web
   * ChatInputImageOptions). Hidden when no handler is passed.
   */
  imageAspectRatio?: string;
  imageSize?: string | null;
  onImageOptionsChange?: (aspectRatio: string, size: string | null) => void;
};

/** Composer — mirrors the web ChatInput (glass dock + "+" tools menu). */
export function ChatInput({
  placeholder = "Ask anything...",
  onSend,
  disabled = false,
  isLoading = false,
  onStop,
  value: controlledValue,
  onChangeText,
  selectedModel,
  onModelChange,
  attachments = [],
  onAttachFile,
  onRemoveAttachment,
  isListening = false,
  onMicPress,
  webSearchAvailable = false,
  webSearchEnabled = false,
  onWebSearchToggle,
  agentId = null,
  onAgentChange,
  imageAspectRatio = "auto",
  imageSize = null,
  onImageOptionsChange,
}: ChatInputProps) {
  const { isDark, primary, mutedForeground, tokens } = useTheme();
  const router = useRouter();
  const [internalValue, setInternalValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const actionScale = useSharedValue(1);
  const actionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: actionScale.value }],
  }));
  // Drill-in navigation inside the "+" menu, mirroring web's ChatInputTools.
  const [menuView, setMenuView] = useState<"root" | "agents" | "connectors">(
    "root",
  );
  const plusMenu = useDropdown();
  const imageMenu = useDropdown();
  const connectors = useQuery(api.connectors.listConnectors, {});
  const isPaidPlan = useIsProPlan();
  const { getCapabilities } = useModelCapabilities();
  const { reasoningEnabled, toggleReasoning } = useReasoningPreference();
  // Same rules as web ChatInput: thinking for reasoning-capable models (and
  // K-AI), image options for paid plans on image-generation models.
  const modelKnown = AVAILABLE_MODELS.some((m) => m.id === selectedModel);
  const capabilities = modelKnown ? getCapabilities(selectedModel) : [];
  const canReason = isKaiModel(selectedModel) || capabilities.includes("thinking");
  const canGenerateImage =
    !!onImageOptionsChange &&
    isPaidPlan &&
    capabilities.includes("image-generation");
  const supportedImage = getSupportedImageOptions(selectedModel);
  const imageAspectOptions = IMAGE_ASPECT_OPTIONS.filter((o) =>
    supportedImage.aspectRatios.has(o.value),
  );
  const imageSizeOptions = IMAGE_SIZE_OPTIONS.filter((o) =>
    supportedImage.sizes.has(o.value),
  );
  const imageOptionLabel = imageSize
    ? (IMAGE_SIZE_OPTIONS.find((o) => o.value === imageSize)?.label ?? imageSize)
    : (IMAGE_ASPECT_OPTIONS.find((o) => o.value === imageAspectRatio)?.label ??
      "Auto");

  const value = controlledValue ?? internalValue;
  const setValue = onChangeText ?? setInternalValue;
  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !disabled;
  const showSubmitAction = value.trim().length > 0 || attachments.length > 0 || isLoading;
  const activeAgent = AGENTS.find((a) => a.id === agentId) ?? null;
  const connectedConnectors =
    connectors?.filter(
      (connector) => connector.connected && connectorDef(connector.provider),
    ) ?? [];

  // Inline "@" mentions, like web's MentionMenu: typing "@" (optionally plus a
  // few letters) right before the caret lists matching connected connectors.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<
    { start: number; end: number } | undefined
  >(undefined);
  const mention =
    isFocused && selection.start === selection.end
      ? detectMention(value, selection.start)
      : null;
  const mentionQuery = mention?.query.toLowerCase() ?? "";
  const mentionItems = mention
    ? connectedConnectors.filter((connector) => {
        const name = connectorName(connector.provider).toLowerCase();
        return (
          !mentionQuery ||
          connector.provider.includes(mentionQuery) ||
          name.includes(mentionQuery)
        );
      })
    : [];
  const selectMention = (provider: string) => {
    if (!mention) return;
    const next = applyMention(value, mention, provider);
    setValue(next.text);
    const caret = { start: next.caret, end: next.caret };
    setSelection(caret);
    setForcedSelection(caret);
  };

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  };

  const closeMenu = () => {
    plusMenu.close();
    setMenuView("root");
  };

  useEffect(() => {
    actionScale.set(withSequence(
      withTiming(0.82, { duration: 90 }),
      withSpring(1, { damping: 15, stiffness: 240, mass: 0.55 }),
    ));
  }, [actionScale, showSubmitAction]);

  const insertConnectorMention = (provider: string) => {
    const mention = `@${provider}`;
    const hasMention = new RegExp(`(^|\\s)${mention}(?=\\s|$)`, "i").test(
      value,
    );
    if (!hasMention) {
      const spacer = value.length > 0 && !value.endsWith(" ") ? " " : "";
      setValue(`${value}${spacer}${mention} `);
    }
    closeMenu();
  };

  const dockBorder = withAlpha(tokens.foreground, 0.07);
  const filled = showSubmitAction ? canSend || isLoading : true;

  return (
    // Web dock: `glow-rail glass bg-background/45 backdrop-blur-3xl
    // rounded-[26px] p-2.5`, blooming with a primary ring + shadow on focus.
    <View
      style={{
        borderRadius: 26,
        ...softShadow({ color: isFocused ? primary : "#000000", opacity: isFocused ? 0.45 : isDark ? 0.35 : 0.12, radius: isFocused ? 24 : 16, offsetY: isFocused ? 12 : 10 }),
      }}
    >
      {mentionItems.length > 0 ? (
        <MentionMenu
          items={mentionItems.map((connector) => ({
            provider: connector.provider,
            name: connectorName(connector.provider),
            accountLabel: connector.accountLabel ?? undefined,
          }))}
          onSelect={selectMention}
        />
      ) : null}
      <GlassView
        intensity={60}
        style={{
          borderRadius: 26,
          borderWidth: 1,
          borderColor: isFocused ? withAlpha(primary, 0.32) : dockBorder,
          backgroundColor: withAlpha(tokens.background, isDark ? 0.45 : 0.6),
          padding: 10,
        }}
      >
        {/* glass: inset 0 1px 0 foreground 9% */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 26,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderTopWidth: 1,
            borderColor: withAlpha(tokens.foreground, 0.09),
          }}
        />
        {attachments.length > 0 ? (
          <View className="mb-2 flex-row flex-wrap gap-2 px-1">
            {attachments.map((attachment, index) => (
              <View key={attachment.uri} className="relative">
                {attachment.kind === "image" ? (
                  <Image
                    source={{ uri: attachment.uri }}
                    style={{ width: 56, height: 56, borderRadius: 10 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="h-14 max-w-36 flex-row items-center gap-2 rounded-xl border border-border bg-secondary px-2.5">
                    <Icon
                      as={FileText}
                      size={16}
                      className="text-muted-foreground"
                    />
                    <Text
                      numberOfLines={2}
                      className="flex-1 text-[11px] leading-3.5 text-foreground"
                    >
                      {attachment.filename}
                    </Text>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${attachment.filename}`}
                  hitSlop={12}
                  onPress={() => onRemoveAttachment?.(index)}
                  className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-full bg-foreground/80"
                >
                  <Icon as={X} size={11} className="text-background" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {/* Active agent chip — shown when a persona is selected, like web */}
        {activeAgent ? (
          <View className="mb-1 flex-row px-1">
            <Pressable
              onPress={() => onAgentChange?.(null)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${activeAgent.name} agent`}
              className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 active:opacity-80"
            >
              <Icon as={Bot} size={11} className="text-primary" />
              <Text className="text-[11px] font-medium text-primary">
                {activeAgent.name}
              </Text>
              <Icon as={X} size={10} className="text-primary/70" />
            </Pressable>
          </View>
        ) : null}

        <TextInput
          value={value}
          onChangeText={setValue}
          selection={forcedSelection}
          onSelectionChange={(event) => {
            setSelection(event.nativeEvent.selection);
            if (forcedSelection) setForcedSelection(undefined);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isListening ? "Listening…" : placeholder}
          placeholderTextColor={withAlpha(mutedForeground, 0.85)}
          multiline
          textAlignVertical="top"
          style={{
            minHeight: 44,
            maxHeight: 200,
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: 6,
            fontSize: 16,
            lineHeight: 24,
            color: tokens.foreground,
          }}
        />

        {/* Footer: tools left, actions right (web PromptInputFooter px-1 pt-1) */}
        <View className="flex-row items-center justify-between gap-2 px-1 pt-1">
          <View className="min-w-0 flex-1 flex-row items-center gap-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add attachment or tools"
              onPress={plusMenu.open}
              className="h-8 w-8 items-center justify-center rounded-full border border-foreground/10 bg-foreground/4 active:bg-foreground/10"
            >
              <Icon as={Plus} size={16} className="text-muted-foreground" />
            </Pressable>

            <ModelSelectorTrigger
              modelId={selectedModel}
              onPress={() => setModelSelectorOpen(true)}
            />

            {/* Web ChatInputImageOptions: divider, image glyph, aspect/size select */}
            {canGenerateImage ? (
              <View className="flex-row items-center gap-1 border-l border-foreground/10 pl-1.5">
                <Icon as={ImageIcon} size={14} className="text-muted-foreground" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Image aspect or size: ${imageOptionLabel}`}
                  onPress={imageMenu.open}
                  className="h-8 min-w-16 flex-row items-center justify-between gap-1 rounded-lg border border-foreground/5 bg-foreground/4 px-2.5 active:bg-foreground/8"
                >
                  <Text className="text-[12px] text-muted-foreground">{imageOptionLabel}</Text>
                  <Icon as={ChevronDown} size={12} className="text-muted-foreground/70" />
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Web parity: Live is the default action. It morphs into the
              dictation + submit/stop controls as soon as content exists. */}
          <View className="flex-row items-center gap-1.5">
            {showSubmitAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isListening ? "Stop voice input" : "Start voice input"}
                onPress={onMicPress}
                className={cn(
                  "h-8 w-8 items-center justify-center rounded-full",
                  isListening
                    ? "border border-primary/30 bg-primary/15 active:bg-primary/25"
                    : "active:bg-foreground/5",
                )}
              >
                <Icon
                  as={isListening ? MicOff : Mic}
                  size={16}
                  className={isListening ? "text-primary" : "text-muted-foreground"}
                />
              </Pressable>
            ) : null}

            <Animated.View style={actionStyle}>
              <GlowButton
                flat={!filled}
                disabled={showSubmitAction && !isLoading && !canSend}
                accessibilityLabel={
                  showSubmitAction
                    ? isLoading
                      ? "Stop generating"
                      : "Send message"
                    : "Start Kontinue Live"
                }
                onPress={
                  showSubmitAction
                    ? isLoading
                      ? onStop
                      : submit
                    : () => router.push("/live" as Href)
                }
                style={{ width: 36, height: 36 }}
              >
                <Icon
                  as={showSubmitAction ? (isLoading ? Square : ArrowUp) : AudioLines}
                  size={showSubmitAction ? 18 : 17}
                  strokeWidth={showSubmitAction && !isLoading ? 2.75 : 2.25}
                  className={filled ? "text-primary-foreground" : "text-muted-foreground"}
                />
              </GlowButton>
            </Animated.View>
          </View>
        </View>

        {/* "+" tools menu — mirrors web's dropdown with agents drill-in */}
        <Dropdown
          visible={plusMenu.visible}
          anchor={plusMenu.anchor}
          onClose={closeMenu}
          placement="above"
          keepKeyboard
        >
          {plusMenu.visible && menuView === "root" ? (
            <>
              {webSearchAvailable ? (
                <DropdownItem
                  icon={Globe}
                  label={
                    webSearchEnabled ? "Web Search (On)" : "Web Search (Off)"
                  }
                  active={webSearchEnabled}
                  onPress={() => {
                    onWebSearchToggle?.();
                    closeMenu();
                  }}
                />
              ) : null}
              {canReason ? (
                <DropdownItem
                  icon={Brain}
                  label={reasoningEnabled ? "Thinking (On)" : "Thinking (Off)"}
                  active={reasoningEnabled}
                  onPress={() => {
                    toggleReasoning();
                    closeMenu();
                  }}
                />
              ) : null}
              {onAttachFile ? (
                <DropdownItem
                  icon={Paperclip}
                  label="Attach File"
                  onPress={() => {
                    closeMenu();
                    onAttachFile();
                  }}
                />
              ) : null}
              <DropdownItem
                icon={Plug}
                label={
                  connectedConnectors.length > 0
                    ? `Connectors (${connectedConnectors.length})`
                    : "Connectors"
                }
                onPress={() => {
                  if (connectedConnectors.length > 0) {
                    setMenuView("connectors");
                  } else {
                    closeMenu();
                    router.push("/connectors" as Href);
                  }
                }}
                trailing={
                  connectedConnectors.length > 0 ? (
                    <Icon
                      as={ChevronRight}
                      size={14}
                      className="text-muted-foreground/60"
                    />
                  ) : undefined
                }
              />
              {onAgentChange ? (
                <DropdownItem
                  icon={Bot}
                  label={activeAgent ? `Agent: ${activeAgent.name}` : "Agents"}
                  onPress={() => setMenuView("agents")}
                  trailing={
                    <Icon
                      as={ChevronRight}
                      size={14}
                      className="text-muted-foreground/60"
                    />
                  }
                />
              ) : null}
            </>
          ) : null}
          {plusMenu.visible && menuView === "agents" ? (
            <>
              <DropdownItem
                icon={ChevronLeft}
                label="Back"
                onPress={() => setMenuView("root")}
              />
              <DropdownSeparator />
              <DropdownItem
                icon={Bot}
                label="No agent"
                active={agentId === null}
                onPress={() => {
                  onAgentChange?.(null);
                  closeMenu();
                }}
                trailing={
                  agentId === null ? (
                    <Icon as={Check} size={14} className="text-primary" />
                  ) : undefined
                }
              />
              {AGENTS.map((agent) => (
                <DropdownItem
                  key={agent.id}
                  icon={Bot}
                  label={agent.name}
                  active={agentId === agent.id}
                  onPress={() => {
                    onAgentChange?.(agent.id);
                    closeMenu();
                  }}
                  trailing={
                    agentId === agent.id ? (
                      <Icon as={Check} size={14} className="text-primary" />
                    ) : undefined
                  }
                />
              ))}
            </>
          ) : null}
          {plusMenu.visible && menuView === "connectors" ? (
            <>
              <DropdownItem
                icon={ChevronLeft}
                label="Back"
                onPress={() => setMenuView("root")}
              />
              <DropdownSeparator />
              {connectedConnectors.map((connector) => (
                <DropdownItem
                  key={connector.provider}
                  icon={Plug}
                  label={connectorName(connector.provider)}
                  onPress={() => insertConnectorMention(connector.provider)}
                  trailing={
                    connector.accountLabel ? (
                      <Text
                        numberOfLines={1}
                        className="max-w-28 text-[11px] text-muted-foreground"
                      >
                        {connector.accountLabel}
                      </Text>
                    ) : undefined
                  }
                />
              ))}
              <DropdownSeparator />
              <DropdownItem
                icon={Plug}
                label="Manage connectors"
                onPress={() => {
                  closeMenu();
                  router.push("/connectors" as Href);
                }}
              />
            </>
          ) : null}
        </Dropdown>

        {/* Image aspect / size select (web ChatInputImageOptions) */}
        <Dropdown
          visible={imageMenu.visible}
          anchor={imageMenu.anchor}
          onClose={imageMenu.close}
          placement="above"
          keepKeyboard
          width={188}
        >
          {imageMenu.visible ? (
            <>
              <Text className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Aspect ratio
              </Text>
              {imageAspectOptions.map((option) => {
                const selected = !imageSize && imageAspectRatio === option.value;
                return (
                  <DropdownItem
                    key={option.value}
                    label={option.label}
                    active={selected}
                    onPress={() => {
                      onImageOptionsChange?.(option.value, null);
                      imageMenu.close();
                    }}
                    trailing={
                      selected ? (
                        <Icon as={Check} size={14} className="text-primary" />
                      ) : undefined
                    }
                  />
                );
              })}
              {imageSizeOptions.length > 0 ? (
                <>
                  <DropdownSeparator />
                  <Text className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Size
                  </Text>
                  {imageSizeOptions.map((option) => {
                    const selected = imageSize === option.value;
                    return (
                      <DropdownItem
                        key={option.value}
                        label={option.label}
                        active={selected}
                        onPress={() => {
                          onImageOptionsChange?.("auto", option.value);
                          imageMenu.close();
                        }}
                        trailing={
                          selected ? (
                            <Icon as={Check} size={14} className="text-primary" />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </>
              ) : null}
            </>
          ) : null}
        </Dropdown>

        <ModelSelector
          visible={modelSelectorOpen}
          onClose={() => setModelSelectorOpen(false)}
          selectedModel={selectedModel}
          onSelect={onModelChange}
        />
      </GlassView>
      {/* The live wire rides the dock's own border, like web's ::before ring */}
      <GlowRail radius={26} focused={isFocused} />
    </View>
  );
}

/** Web MentionMenu: glass list of connected connectors above the composer. */
function MentionMenu({
  items,
  onSelect,
}: {
  items: { provider: string; name: string; accountLabel?: string }[];
  onSelect: (provider: string) => void;
}) {
  const { isDark } = useTheme();
  return (
    <View
      style={{
        position: "absolute",
        bottom: "100%",
        left: 8,
        width: 260,
        marginBottom: 8,
        zIndex: 50,
        borderRadius: 14,
        ...softShadow({ color: "#000", opacity: 0.35, radius: 18, offsetY: 8 }),
      }}
    >
      <GlassView
        intensity={50}
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
          backgroundColor: isDark ? "rgba(12,9,12,0.86)" : "rgba(255,251,253,0.9)",
          padding: 4,
        }}
      >
        <Text className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Connectors
        </Text>
        {items.slice(0, 6).map((item) => {
          const def = connectorDef(item.provider);
          return (
            <Pressable
              key={item.provider}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${item.name}`}
              // onPressIn fires before the composer can blur and hide the menu.
              onPressIn={() => onSelect(item.provider)}
              className="min-h-10 flex-row items-center gap-2.5 rounded-lg px-2 active:bg-foreground/8"
            >
              {def ? <ConnectorLogo def={def} size={18} /> : null}
              <Text numberOfLines={1} className="flex-1 text-[13.5px] text-foreground">
                {item.name}
              </Text>
              {item.accountLabel ? (
                <Text numberOfLines={1} className="max-w-24 text-[11.5px] text-muted-foreground">
                  @{item.accountLabel}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </GlassView>
    </View>
  );
}
