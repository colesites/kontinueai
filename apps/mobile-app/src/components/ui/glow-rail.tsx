import { useEffect, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { useTheme } from "@/components/theme-provider";
import { arcAt, geometry, GLOW_STROKE, type Geometry } from "@/lib/glow-geometry";

/**
 * Native version of web's `glow-rail` / `glow-rail-focus` (shared-styles.css):
 *
 *   conic-gradient(from var(--glow-angle),
 *     transparent 0deg, transparent 30deg,
 *     mix(primary 78%, white 22%) 58deg, primary 74deg,
 *     mix(primary 78%, white 22%) 90deg, transparent 122deg, transparent)
 *
 * masked to a 1.5px ring, spinning 7s (4.5s focused), at 0.4 opacity (1 when
 * focused). A conic gradient is angle-based: on a wide box the comet drifts
 * past the top and bottom centers and speeds up toward the ends. That is reproduced exactly by slicing the lit
 * arc into thin angular wedges and, every frame, intersecting each wedge's
 * rays with the rounded rectangle to find where it lands on the border
 * (the arc-length dash it occupies).
 */

const STROKE = GLOW_STROKE;
const ARC_START = 30;
const ARC_END = 122;
const SLICES = 18;

/** Rounded-rect centerline path, clockwise from top-center. */
function ringPath(width: number, height: number, g: Geometry): string {
  const cx = width / 2;
  const cy = height / 2;
  const left = cx - g.a;
  const right = cx + g.a;
  const top = cy - g.b;
  const bottom = cy + g.b;
  const r = g.r;
  return [
    `M ${cx} ${top}`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${top + r}`,
    `V ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `H ${left + r}`,
    `A ${r} ${r} 0 0 1 ${left} ${bottom - r}`,
    `V ${top + r}`,
    `A ${r} ${r} 0 0 1 ${left + r} ${top}`,
    "Z",
  ].join(" ");
}

function mixWithWhite(hex: string, white: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - white) + 255 * white)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Stop profile of the conic gradient at an angle inside the lit arc. */
function sliceStyle(mid: number, primary: string, tint: string) {
  // alpha: 0 → 1 over 30..58, 1 over 58..90, 1 → 0 over 90..122
  const alpha =
    mid < 58 ? (mid - ARC_START) / 28 : mid > 90 ? (ARC_END - mid) / 32 : 1;
  // color: tint at 58 and 90, pure primary at 74
  const color = mid >= 66 && mid <= 82 ? primary : tint;
  return { alpha: Math.max(0, Math.min(1, alpha)), color };
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function Slice({
  d,
  from,
  to,
  angle,
  g,
  color,
  alpha,
}: {
  d: string;
  from: number;
  to: number;
  angle: SharedValue<number>;
  g: Geometry;
  color: string;
  alpha: number;
}) {
  const animatedProps = useAnimatedProps(() => {
    const start = arcAt(angle.get() + from, g);
    const end = arcAt(angle.get() + to, g);
    // Overlap neighbours by half a point so no seams show between slices.
    const length = (((end - start) % g.total) + g.total) % g.total + 0.5;
    return {
      strokeDasharray: `${length} ${Math.max(0, g.total - length)}`,
      strokeDashoffset: -start,
    };
  });
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeOpacity={alpha}
      strokeWidth={STROKE}
      strokeLinecap="butt"
      animatedProps={animatedProps}
    />
  );
}

export function GlowRail({
  radius,
  focused,
  variant = "rail",
}: {
  /** Border radius of the element it rings. */
  radius: number;
  focused: boolean;
  /** "rail": always on, brighter when focused. "focus": only when focused. */
  variant?: "rail" | "focus";
}) {
  const { primary } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const angle = useSharedValue(0);
  const visible = variant === "rail" || focused;
  const duration = focused ? 4500 : 7000;

  useEffect(() => {
    if (!visible) {
      cancelAnimation(angle);
      return;
    }
    // Continue from wherever the comet is, so a speed change never jumps.
    // The angle just keeps growing; the trig in arcAt wraps it.
    const from = angle.get();
    angle.set(
      withRepeat(withTiming(from + 360, { duration, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(angle);
  }, [angle, duration, visible]);

  const opacityStyle = useAnimatedStyle(() => ({
    opacity: withTiming(variant === "focus" ? (focused ? 1 : 0) : focused ? 1 : 0.4, {
      duration: 350,
    }),
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };

  const ready = size.width > 0 && size.height > 0;
  const g = ready ? geometry(size.width, size.height, radius) : null;
  const d = ready && g ? ringPath(size.width, size.height, g) : "";
  const tint = mixWithWhite(primary, 0.22);
  const step = (ARC_END - ARC_START) / SLICES;

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {ready && g ? (
        <Animated.View style={[{ flex: 1 }, opacityStyle]}>
          <Svg width={size.width} height={size.height}>
            {Array.from({ length: SLICES }, (_, index) => {
              const from = ARC_START + index * step;
              const to = from + step;
              const { alpha, color } = sliceStyle((from + to) / 2, primary, tint);
              return (
                <Slice
                  key={index}
                  d={d}
                  from={from}
                  to={to}
                  angle={angle}
                  g={g}
                  color={color}
                  alpha={alpha}
                />
              );
            })}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
