import { Platform, type ViewStyle } from "react-native";

/**
 * A soft drop shadow that looks the same on both platforms.
 *
 * Android's `elevation` casts its shadow from the view's outline. A view with
 * no background of its own (a shadow wrapper around a glass panel) has a plain
 * rectangle for an outline, and anything translucent on top lets that
 * rectangle show through as a box inside the panel. `boxShadow` follows the
 * border radius and is drawn only outside the view, so Android uses that.
 */
export function softShadow({
  color = "#000000",
  opacity,
  radius,
  offsetY = 0,
}: {
  color?: string;
  opacity: number;
  /** iOS `shadowRadius`; Android blurs twice that, like CSS. */
  radius: number;
  offsetY?: number;
}): ViewStyle {
  if (Platform.OS !== "android") {
    return {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: offsetY },
    };
  }
  return { boxShadow: `0px ${offsetY}px ${radius * 2}px ${rgba(color, opacity)}` };
}

/** "#rgb", "#rrggbb" or "#rrggbbaa" at `alpha`, as rgba(). */
export function rgba(color: string, alpha: number): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!match) return color;
  const value = Number.parseInt(match[1]!, 16);
  const base = match[2] ? Number.parseInt(match[2], 16) / 255 : 1;
  const a = Math.max(0, Math.min(1, alpha * base));
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Number(a.toFixed(3))})`;
}
