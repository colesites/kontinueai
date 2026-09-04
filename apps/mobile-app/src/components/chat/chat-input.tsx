import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import {
  Bot,
  ArrowUp,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Mic,
  MicOff,
  Paperclip,
  Plug,
  Plus,
  SendHorizontal,
  Square,
  X,
} from "lucide-react-native";
import { AGENTS } from "@repo/ai/lib/agents";

import {
  ModelSelector,
  ModelSelectorTrigger,
} from "@/components/chat/model-selector";
import { GlassView } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { LinearGradient } from "expo-linear-gradient";
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  useDropdown,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import type { PendingAttachment } from "@/lib/chat-attachments";

const CONNECTOR_NAMES: Record<string, string> = {
  github: "GitHub",
  notion: "Notion",
  vercel: "Vercel",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  google_sheets: "Google Sheets",
  todoist: "Todoist",
};

/* ─── Animated Glow Rail ──────────────────────────────────────────────
   React Native replica of the web's `glow-rail` CSS utility
   (shared-styles.css lines 518-556).

   Web CSS technique:
   ─ A ::before pseudo-element with a conic-gradient rotates around
     the container border at 7s per lap (4.5s on :focus-within).
   ─ The gradient arc spans 30°→122° (92° total / 25.5% of perimeter):
       transparent → color-mix(primary 78%, white 22%) → primary → lighter → transparent
   ─ mask-composite: exclude crops it to a 1.5px border ring.
   ─ At rest: opacity 0.4.  On focus-within: opacity 1 + box-shadow.

   Native replica:
   CSS conic-gradient with mask-composite is not available in React Native.
   We use react-native-svg animated <Rect> strokes instead:
   ─ One 1.5px stroke at full opacity for the bright core (~9% of perimeter,
     matching the 58°→90° bright zone = 32°/360°).
   ─ One 1.5px stroke at 30% opacity for the full comet arc (~25.5%),
     creating the soft leading/trailing fade.
   ─ One wider 4px stroke at 10% opacity behind both for subtle glow halo.
   All three share the same animated dashOffset so they look like a single
   comet with a bright center and soft edges — not stacked lines.
   ─────────────────────────────────────────────────────────────────── */

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const BORDER_RADIUS = 24.5;
const BORDER_WIDTH = 1.5;

function calcPerimeter(w: number, h: number, r: number) {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

// Web gradient arc: 30°→122° = 92°/360° ≈ 25.5% of perimeter (full comet).
// Bright zone:      58°→ 90° = 32°/360° ≈  8.9% of perimeter (core).
const ARC_FULL = 0.255;
const ARC_CORE = 0.089;

function GlowRail({ isFocused }: { isFocused: boolean }) {
  const { primary } = useTheme();
  const [dims, setDims] = useState({ w: 0, h: 0, p: 0 });
  const progress = useSharedValue(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || dims.p === 0) return;
    started.current = true;
    // 7s matches the web's `animation: glow-rail-spin 7s linear infinite`
    progress.value = withRepeat(
      withTiming(1, { duration: 7000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [dims.p, progress]);

  // Web: opacity 0.4 at rest, 1 on :focus-within, transition 350ms ease.
  const opacityStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isFocused ? 1 : 0.4, { duration: 350 }),
  }));

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      const iw = width - BORDER_WIDTH * 2;
      const ih = height - BORDER_WIDTH * 2;
      setDims({ w: width, h: height, p: calcPerimeter(iw, ih, BORDER_RADIUS) });
    },
    [],
  );

  // All layers share the same offset — they overlap, not stack.
  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: -(progress.value * dims.p),
  }));

  if (dims.p === 0) {
    return <View className="absolute inset-0" pointerEvents="none" onLayout={onLayout} />;
  }

  const x = BORDER_WIDTH;
  const y = BORDER_WIDTH;
  const w = dims.w - BORDER_WIDTH * 2;
  const h = dims.h - BORDER_WIDTH * 2;
  const shared = { x, y, width: w, height: h, rx: BORDER_RADIUS, ry: BORDER_RADIUS, fill: "none" as const, strokeLinecap: "round" as const };

  return (
    <Animated.View className="absolute inset-0" pointerEvents="none" onLayout={onLayout} style={opacityStyle}>
      <Svg width={dims.w} height={dims.h}>
        {/* Subtle glow halo behind the comet */}
        <AnimatedRect
          {...shared}
          stroke={primary} strokeWidth={4} opacity={0.10}
          strokeDasharray={`${dims.p * ARC_FULL} ${dims.p * (1 - ARC_FULL)}`}
          animatedProps={animProps}
        />
        {/* Full comet arc — 25.5%, lower opacity = soft fade edges */}
        <AnimatedRect
          {...shared}
          stroke={primary} strokeWidth={BORDER_WIDTH} opacity={0.35}
          strokeDasharray={`${dims.p * ARC_FULL} ${dims.p * (1 - ARC_FULL)}`}
          animatedProps={animProps}
        />
        {/* Bright core — 8.9%, full opacity = crisp center */}
        <AnimatedRect
          {...shared}
          stroke={primary} strokeWidth={BORDER_WIDTH} opacity={1}
          strokeDasharray={`${dims.p * ARC_CORE} ${dims.p * (1 - ARC_CORE)}`}
          animatedProps={animProps}
        />
      </Svg>
    </Animated.View>
  );
}

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
}: ChatInputProps) {
  const { isDark, primary, mutedForeground } = useTheme();
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
  const connectors = useQuery(api.connectors.listConnectors, {});

  const value = controlledValue ?? internalValue;
  const setValue = onChangeText ?? setInternalValue;
  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !disabled;
  const showSubmitAction = value.trim().length > 0 || attachments.length > 0 || isLoading;
  const activeAgent = AGENTS.find((a) => a.id === agentId) ?? null;
  const connectedConnectors =
    connectors?.filter(
      (connector) => connector.connected && CONNECTOR_NAMES[connector.provider],
    ) ?? [];

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

  return (
    // Mirrors the web dock: `glow-rail glass bg-background/45 backdrop-blur-3xl
    // rounded-[26px] p-2.5 transition-shadow duration-300`.
    <View
      style={{
        borderRadius: 26,
        padding: BORDER_WIDTH,
      }}
    >
      <GlowRail isFocused={isFocused} />
      <GlassView
        intensity={45}
        style={{
          borderRadius: 24.5,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          backgroundColor: isDark
            ? "rgba(12,9,12,0.45)"
            : "rgba(255,251,253,0.45)",
          padding: 8.5,
        }}
      >
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
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isListening ? "Listening…" : placeholder}
          placeholderTextColor={mutedForeground}
          multiline
          className="max-h-40 min-h-16 px-2 py-2.5 text-[16px] leading-6 text-foreground"
        />

        <View className="mt-1 flex-row items-center justify-between">
          {/* Left tools: "+" menu + model selector (mirrors ChatInputTools) */}
          <View className="flex-1 flex-row items-center gap-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add attachment or tools"
              onPress={plusMenu.open}
              className="h-9 w-9 items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 active:bg-foreground/10"
            >
              <Icon as={Plus} size={16} className="text-muted-foreground" />
            </Pressable>

            <ModelSelectorTrigger
              modelId={selectedModel}
              onPress={() => setModelSelectorOpen(true)}
            />
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
                  "h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
                  isListening
                    ? "bg-primary/15 active:bg-primary/25"
                    : "active:bg-foreground/5",
                )}
                style={isListening ? {
                  shadowColor: primary,
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 2,
                } : undefined}
              >
                <Icon
                  as={isListening ? MicOff : Mic}
                  size={16}
                  className={isListening ? "text-primary" : "text-muted-foreground"}
                />
              </Pressable>
            ) : null}

            <Animated.View style={actionStyle}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showSubmitAction
                    ? isLoading
                      ? "Stop generating"
                      : "Send message"
                    : "Start Kontinue Live"
                }
                disabled={showSubmitAction && !isLoading && !canSend}
                onPress={
                  showSubmitAction
                    ? isLoading
                      ? onStop
                      : submit
                    : () => router.push("/live" as Href)
                }
                className={cn(
                  "h-9 w-9 overflow-hidden items-center justify-center rounded-full",
                  showSubmitAction
                    ? canSend || isLoading
                      ? "bg-primary active:opacity-90"
                      : "bg-foreground/8"
                    : "active:opacity-90",
                )}
                style={
                  (showSubmitAction && (canSend || isLoading)) || !showSubmitAction
                    ? {
                        // Web `glow-button`: a hairline rim plus a SOFT bloom
                        // (0 2px 6px -2px / 0 8px 24px -6px at ~50% primary).
                        // The old 0.4 opacity + elevation 4 bloomed so hard it
                        // swallowed the rim entirely.
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.22)",
                        shadowColor: primary,
                        shadowOpacity: 0.18,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                      }
                    : undefined
                }
              >
                {!showSubmitAction && (
                  <View className="absolute inset-0 bg-primary" />
                )}
                {/* glow-button's `inset 0 1px 0 white 30%` top highlight, which
                    is what gives the pill its lit upper rim. Only on the filled
                    states — the disabled pill stays flat. */}
                {(showSubmitAction && (canSend || isLoading)) || !showSubmitAction ? (
                  <LinearGradient
                    colors={["rgba(255,255,255,0.30)", "rgba(255,255,255,0.04)", "transparent"]}
                    locations={[0, 0.45, 1]}
                    className="absolute inset-0"
                    pointerEvents="none"
                  />
                ) : null}
                <Icon
                  as={
                    showSubmitAction
                      ? isLoading
                        ? Square
                        : ArrowUp
                      : AudioLines
                  }
                  size={20}
                  strokeWidth={showSubmitAction && !isLoading ? 3 : 2.5}
                  className={
                    showSubmitAction
                      ? canSend || isLoading
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                      : "text-primary-foreground"
                  }
                />
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/* "+" tools menu — mirrors web's dropdown with agents drill-in */}
        <Dropdown
          visible={plusMenu.visible}
          anchor={plusMenu.anchor}
          onClose={closeMenu}
          placement="above"
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
                  label={
                    CONNECTOR_NAMES[connector.provider] ?? connector.provider
                  }
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

        <ModelSelector
          visible={modelSelectorOpen}
          onClose={() => setModelSelectorOpen(false)}
          selectedModel={selectedModel}
          onSelect={onModelChange}
        />
      </GlassView>
    </View>
  );
}
