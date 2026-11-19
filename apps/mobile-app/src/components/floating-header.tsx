import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";

import { withAlpha } from "@/components/chat/markdown";
import { useTheme } from "@/components/theme-provider";
import { GlassPill } from "@/components/top-toolbar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * Header that floats over a scrolling page, like the chat and Canvas
 * toolbars: glass pills on a fade, with the content scrolling underneath.
 * Pad the page's content by the height reported through `onHeight`.
 */
export function FloatingHeader({
  left,
  right,
  onHeight,
}: {
  left?: ReactNode;
  right?: ReactNode;
  onHeight: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[tokens.background, withAlpha(tokens.background, 0.8), withAlpha(tokens.background, 0)]}
        locations={[0, 0.6, 1]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: -18 }}
      />
      <View pointerEvents="box-none" className="flex-row items-center justify-between gap-2 px-3 pb-2 pt-3">
        <View pointerEvents="box-none" className="flex-row items-center gap-2">
          {left}
        </View>
        <View pointerEvents="box-none" className="flex-row items-center gap-2">
          {right}
        </View>
      </View>
    </View>
  );
}

/** A labelled glass button for a FloatingHeader ("Back to chat", "Sign out"). */
export function FloatingHeaderButton({
  label,
  icon,
  onPress,
  destructive = false,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <GlassPill className="p-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        className={
          destructive
            ? "h-8 flex-row items-center gap-2 rounded-xl px-3 active:bg-destructive/10"
            : "h-8 flex-row items-center gap-2 rounded-xl px-3 active:bg-foreground/4"
        }
      >
        <Icon as={icon} size={15} className={destructive ? "text-destructive" : "text-muted-foreground"} />
        <Text className={destructive ? "text-[13px] font-medium text-destructive" : "text-[13px] font-medium text-muted-foreground"}>
          {label}
        </Text>
      </Pressable>
    </GlassPill>
  );
}
