import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { PanelLeft, Plus, Search } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { ModeToggle } from "@/components/mode-toggle";
import { useSidebar } from "@/components/sidebar/sidebar-context";
import { GlassView } from "@/components/ui/glass";
import { useTheme } from "@/components/theme-provider";

/**
 * Floating top controls — mirrors web AppShell. The group "pill" is `rounded-2xl`
 * (not fully round); only the individual icon buttons inside are `rounded-full`.
 */
export function TopToolbar({
  rightSlot,
}: {
  /** Extra controls placed before the theme toggle (e.g. Share on a chat). */
  rightSlot?: ReactNode;
} = {}) {
  const { openSidebar } = useSidebar();
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between px-4 py-2 mt-2">
      <GlassPill className="flex-row items-center gap-1.5 p-1">
        <ToolbarButton label="Open sidebar" icon={PanelLeft} onPress={openSidebar} />
        <ToolbarButton label="Search" icon={Search} onPress={openSidebar} />
        {/* Home is the new-chat composer (web routes New chat to "/" too).
            "/chat/new" mounted the conversation screen with an invalid id. */}
        <ToolbarButton label="New chat" icon={Plus} onPress={() => router.push("/")} />
      </GlassPill>

      <GlassPill className="flex-row items-center gap-1 p-1">
        {rightSlot}
        <ModeToggle />
      </GlassPill>
    </View>
  );
}

/**
 * Liquid-glass pill. A single flat border reads as a printed outline, so the
 * rim is built the way the web one is: a translucent hairline all round, a
 * brighter LIT TOP edge, and a thinner, darker bottom edge. That top-light /
 * bottom-dark split is what gives the pill its raised 3D look.
 *
 * React Native has no per-side border radius + width combination that keeps
 * the rounded corners intact, so the top and bottom edges are drawn as inset
 * hairline overlays inside the pill instead (see GlassRim).
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
  const { isDark } = useTheme();
  return (
    <GlassView
      intensity={40}
      className={className}
      style={{
        borderRadius: radius,
        borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.42 : 0.14,
        shadowRadius: 18,
        elevation: 10,
      }}
    >
      <GlassRim isDark={isDark} />
      {children}
    </GlassView>
  );
}

/**
 * The lit top edge and thinner, darker bottom edge that make the pill read as
 * a raised piece of glass rather than a flat outlined box. Sits inside the
 * GlassView's clip, so it follows the rounded corners.
 */
function GlassRim({ isDark }: { isDark: boolean }) {
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 12,
          right: 12,
          height: 1,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.22)"
            : "rgba(255,255,255,0.85)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 0,
          left: 20,
          right: 20,
          // Thinner than the top edge: the underside catches less light.
          height: StyleSheet.hairlineWidth,
          backgroundColor: isDark
            ? "rgba(0,0,0,0.35)"
            : "rgba(0,0,0,0.10)",
        }}
      />
    </>
  );
}

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
          ? "h-9 w-9 items-center justify-center rounded-full opacity-40"
          : "h-9 w-9 items-center justify-center rounded-full active:bg-accent"
      }
    >
      <Icon as={icon} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}
