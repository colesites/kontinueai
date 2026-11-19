import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { withAlpha } from "@/components/chat/markdown";
import { useTheme } from "@/components/theme-provider";
import { TopToolbar } from "@/components/top-toolbar";

/** Height the floating toolbar occupies: safe area + `top-3` + 40px pill + gap. */
export function useFloatingToolbarInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + 12 + 40 + 12;
}

/**
 * Web AppShell's floating controls for full pages (Agents, Tasks, …): glass
 * pills pinned over the page while it scrolls beneath, with a soft fade so
 * scrolled text never collides with them.
 */
export function FloatingToolbar({
  rightSlot,
  centerSlot,
}: {
  rightSlot?: ReactNode;
  centerSlot?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, zIndex: 40 }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[tokens.background, withAlpha(tokens.background, 0.75), withAlpha(tokens.background, 0)]}
        locations={[0, 0.6, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: -14 }}
      />
      <TopToolbar rightSlot={rightSlot} centerSlot={centerSlot} />
    </View>
  );
}
