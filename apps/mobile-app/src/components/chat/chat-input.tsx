import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import {
  Bot,
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
import {
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  useDropdown,
} from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import type { PendingAttachment } from "@/lib/chat-attachments";

const PLACEHOLDER_COLOR = { light: "#9b8893", dark: "#7c6c77" } as const;

type ChatInputProps = {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
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
  const { isDark, primary } = useTheme();
  const router = useRouter();
  const [internalValue, setInternalValue] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  // Drill-in navigation inside the "+" menu, mirroring web's ChatInputTools.
  const [menuView, setMenuView] = useState<"root" | "agents">("root");
  const plusMenu = useDropdown();

  const value = controlledValue ?? internalValue;
  const setValue = onChangeText ?? setInternalValue;
  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !disabled;
  const activeAgent = AGENTS.find((a) => a.id === agentId) ?? null;

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  };

  const closeMenu = () => {
    plusMenu.close();
    setMenuView("root");
  };

  return (
    // Mirrors the web dock: `glass bg-background/40 backdrop-blur-3xl
    // rounded-3xl p-3` with the home page's primary glow blob rendered as a
    // colored halo shadow around the card.
    <View
      style={{
        borderRadius: 24,
        shadowColor: primary,
        shadowOpacity: 0.45,
        shadowRadius: 32,
        shadowOffset: { width: 0, height: 6 },
        elevation: 14,
      }}
    >
      <GlassView
        intensity={32}
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          backgroundColor: isDark
            ? "rgba(12,9,12,0.40)"
            : "rgba(255,251,253,0.40)",
          padding: 12,
        }}
      >
        {attachments.length > 0 ? (
          <View className="mb-2 flex-row flex-wrap gap-2 px-1">
            {attachments.map((attachment, index) => (
              <View key={`${attachment.uri}-${index}`} className="relative">
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
                  hitSlop={6}
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
              className="flex-row items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 active:opacity-80"
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
          placeholder={isListening ? "Listening…" : placeholder}
          placeholderTextColor={PLACEHOLDER_COLOR[isDark ? "dark" : "light"]}
          multiline
          className="max-h-40 min-h-12 px-2 py-1.5 text-[16px] leading-6 text-foreground"
        />

        <View className="mt-1 flex-row items-center justify-between">
          {/* Left tools: "+" menu + model selector (mirrors ChatInputTools) */}
          <View className="flex-1 flex-row items-center gap-0.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add attachment or tools"
              onPress={plusMenu.open}
              className="h-8 w-8 items-center justify-center rounded-full active:bg-foreground/5"
            >
              <Icon as={Plus} size={17} className="text-muted-foreground" />
            </Pressable>

            <ModelSelectorTrigger
              modelId={selectedModel}
              onPress={() => setModelSelectorOpen(true)}
            />
          </View>

          {/* Right: mic + send */}
          <View className="flex-row items-center gap-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isListening ? "Stop voice input" : "Voice input"
              }
              onPress={onMicPress}
              className={cn(
                "h-8 w-8 items-center justify-center rounded-full active:bg-foreground/5",
                isListening && "bg-primary/15",
              )}
            >
              <Icon
                as={isListening ? MicOff : Mic}
                size={17}
                className={
                  isListening ? "text-primary" : "text-muted-foreground"
                }
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!canSend}
              onPress={submit}
              className={cn(
                "h-9 w-9 items-center justify-center rounded-full",
                canSend ? "bg-primary active:opacity-90" : "bg-foreground/8",
              )}
              style={
                canSend
                  ? {
                      shadowColor: "#ec4899",
                      shadowOpacity: 0.4,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 4,
                    }
                  : undefined
              }
            >
              <Icon
                as={SendHorizontal}
                size={16}
                className={
                  canSend ? "text-primary-foreground" : "text-muted-foreground"
                }
              />
            </Pressable>
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
                label="Connectors"
                onPress={() => {
                  closeMenu();
                  router.push("/connectors" as Href);
                }}
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
