import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { PanelLeft, Plus, Search } from "lucide-react-native";

import { withAlpha } from "@/components/chat/markdown";
import { ModeToggle } from "@/components/mode-toggle";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { useTheme } from "@/components/theme-provider";
import { GlassView } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { softShadow } from "@/lib/shadow";

/**
 * Floating top controls — mirrors web AppShell (`fixed top-3 px-3`). The group
 * "pill" is `rounded-2xl` (not fully round); only the 32px icon buttons inside
 * are `rounded-full`.
 */
export function TopToolbar({
  rightSlot,
  centerSlot,
}: {
  /** Extra controls placed before the theme toggle (e.g. Share on a chat). */
  rightSlot?: ReactNode;
  /** A second pill beside the icons (e.g. Canvas's Community switcher). */
  centerSlot?: ReactNode;
} = {}) {
  const { openSidebar } = useSidebar();
  const router = useRouter();

  return (
    <View className="flex-row items-start justify-between px-3 pt-3">
      <View className="flex-row items-start gap-3">
        <GlassPill className="flex-row items-center gap-1 p-1">
          <ToolbarButton label="Open sidebar" icon={PanelLeft} onPress={openSidebar} />
          <ToolbarButton label="Search" icon={Search} onPress={openSidebar} />
          {/* Home is the new-chat composer (web routes New chat to "/" too). */}
          <ToolbarButton label="New chat" icon={Plus} onPress={() => router.push("/")} />
        </GlassPill>
        {centerSlot}
      </View>

      <GlassPill className="flex-row items-center gap-1 p-1">
        {rightSlot}
        <ModeToggle />
      </GlassPill>
    </View>
  );
}

/**
 * Web `glass bg-background/40 backdrop-blur-3xl rounded-2xl`: a 7% foreground
 * hairline all round, the glass utility's `inset 0 1px 0 foreground 9%` top
 * highlight (drawn as a top border that follows the corner curve), and
 * `0 10px 32px -12px black 35%` underneath.
 */
export function GlassPill({
  children,
  className,
  radius = 16,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
}) {
  const { isDark, tokens } = useTheme();
  return (
    <View
      style={{
        borderRadius: radius,
        ...softShadow({ color: "#000000", opacity: isDark ? 0.35 : 0.12, radius: 14, offsetY: 10 }),
      }}
    >
      <GlassView
        intensity={64}
        className={className}
        style={{
          borderRadius: radius,
          borderWidth: 1,
          borderColor: withAlpha(tokens.foreground, 0.07),
          backgroundColor: withAlpha(tokens.background, isDark ? 0.4 : 0.55),
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: radius,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
            borderTopWidth: 1,
            borderColor: withAlpha(tokens.foreground, 0.09),
          }}
        />
        {children}
      </GlassView>
    </View>
  );
}

/** Web `toolbarButtonClasses`: 32px round, muted icon, foreground/8 press. */
export function ToolbarButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: typeof PanelLeft;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={
        disabled
          ? "h-8 w-8 items-center justify-center rounded-full opacity-40"
          : "h-8 w-8 items-center justify-center rounded-full active:bg-foreground/8"
      }
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}
