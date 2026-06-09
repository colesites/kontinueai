import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ChevronDown, Mic, Plus, SendHorizontal } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const PLACEHOLDER_COLOR = { light: "#9b8893", dark: "#7c6c77" } as const;

type ChatInputProps = {
  placeholder?: string;
  model?: string;
  onSend?: (text: string) => void;
  onModelPress?: () => void;
};

/** Home / chat composer — mirrors the web ChatInput (glass rounded-3xl). */
export function ChatInput({
  placeholder = "Ask anything...",
  model = "K-AI 1.0",
  onSend,
  onModelPress,
}: ChatInputProps) {
  const { isDark } = useTheme();
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend?.(value.trim());
    setValue("");
  };

  return (
    <View className="rounded-3xl border border-border bg-card/60 p-3">
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR[isDark ? "dark" : "light"]}
        multiline
        className="max-h-40 min-h-12 px-2 py-1.5 text-[16px] leading-6 text-foreground"
      />

      <View className="mt-1 flex-row items-center justify-between">
        {/* Left: add + model selector */}
        <View className="flex-row items-center gap-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add"
            className="h-9 w-9 items-center justify-center rounded-full active:bg-accent"
          >
            <Icon as={Plus} size={20} className="text-muted-foreground" />
          </Pressable>

          <Pressable
            onPress={onModelPress}
            accessibilityRole="button"
            className="h-9 flex-row items-center gap-1.5 rounded-full px-2 active:bg-accent"
          >
            <View className="h-6 w-6 items-center justify-center rounded-full bg-secondary">
              <RobotMark />
            </View>
            <Text className="text-[14px] font-medium text-foreground">{model}</Text>
            <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
          </Pressable>
        </View>

        {/* Right: mic + send */}
        <View className="flex-row items-center gap-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice input"
            className="h-9 w-9 items-center justify-center rounded-full active:bg-accent"
          >
            <Icon as={Mic} size={18} className="text-muted-foreground" />
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
          >
            <Icon
              as={SendHorizontal}
              size={17}
              className={canSend ? "text-primary-foreground" : "text-muted-foreground"}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Tiny robot glyph for the K-AI model pill (matches the brand mark). */
function RobotMark() {
  return (
    <View className="h-3.5 w-4 items-center justify-center rounded-[3px] border border-foreground/70">
      <View className="flex-row gap-[2px]">
        <View className="h-[3px] w-[3px] rounded-full bg-foreground/70" />
        <View className="h-[3px] w-[3px] rounded-full bg-foreground/70" />
      </View>
    </View>
  );
}
