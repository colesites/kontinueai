import type { ReactNode } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/components/theme-provider";
import { softShadow } from "@/lib/shadow";

/** `#rrggbb` mixed toward white (web `color-mix(in oklch, x, white n%)`). */
export function mixWhite(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - amount) + 255 * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * Web `glow-button`: a top-lit primary gradient (primary 88% + white 12% →
 * primary), a 1px inset highlight along the top, and a soft two-layer primary
 * bloom underneath. Used for the composer's send / Live button and primary
 * CTAs (Canvas generate, agent "Chat with…", task add).
 */
export function GlowButton({
  children,
  onPress,
  disabled = false,
  radius = 999,
  style,
  accessibilityLabel,
  flat = false,
}: {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  radius?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Muted, unlit look (e.g. send with nothing to send). */
  flat?: boolean;
}) {
  const { primary, tokens } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius,
          // `0 8px 24px -6px primary 55%` + `0 2px 6px -2px primary 50%`
          ...softShadow({ color: flat ? "transparent" : primary, opacity: flat ? 0 : 0.55, radius: 10, offsetY: 5 }),
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: radius,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        {flat ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: `${tokens.foreground}14` }]}
          />
        ) : (
          <>
            <LinearGradient
              colors={[mixWhite(primary, 0.12), primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* inset 0 1px 0 white 30%: clipped by the rounded corners */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: "rgba(255,255,255,0.30)",
              }}
            />
          </>
        )}
        {children}
      </Pressable>
    </View>
  );
}
