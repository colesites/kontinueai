import { Pressable, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { Check, Moon, Sun } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Dropdown, DropdownSeparator, useDropdown } from "@/components/ui/dropdown";
import { useTheme } from "@/components/theme-provider";
import { THEMES, THEME_LABELS, THEME_SWATCH, type Mode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MODES: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Blend a hex color toward white by `ratio` (0–1). */
function lighten(hex: string, ratio: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `rgb(${lr},${lg},${lb})`;
}

/**
 * Glossy 3D color ball — mirrors the web swatch:
 * `radial-gradient(circle at 30% 30%, lighter, color)` + inset top sheen +
 * colored drop shadow. The radial highlight (top-left) and a soft white
 * specular blob give it depth that a flat fill can't.
 */
export function GlossySwatch({ id, color }: { id: string; color: string }) {
  const fillId = `swatch-fill-${id}`;
  const sheenId = `swatch-sheen-${id}`;
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        boxShadow: `0 2px 5px ${color}80`,
      }}
    >
      <Svg width={24} height={24}>
        <Defs>
          <RadialGradient id={fillId} cx="32%" cy="28%" r="80%">
            <Stop offset="0" stopColor={lighten(color, 0.28)} />
            <Stop offset="0.65" stopColor={color} />
            <Stop offset="1" stopColor={color} />
          </RadialGradient>
          <RadialGradient id={sheenId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* base ball */}
        <Circle cx={12} cy={12} r={11.5} fill={`url(#${fillId})`} />
        {/* top-left specular highlight */}
        <Circle cx={8.5} cy={7.5} r={4.5} fill={`url(#${sheenId})`} />
      </Svg>
    </View>
  );
}

/** Web ModeToggle's check pill — primary circle, only when active. */
function CheckPill({ active }: { active: boolean }) {
  if (!active) return <View style={{ width: 20, height: 20 }} />;
  return (
    <View
      className="items-center justify-center rounded-full bg-primary"
      style={{
        width: 20,
        height: 20,
        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
      }}
    >
      <Icon as={Check} size={12} strokeWidth={3} className="text-primary-foreground" />
    </View>
  );
}

/**
 * Theme menu — mirrors web ModeToggle exactly: glass dropdown with
 * "Appearance" (Light/Dark/System) and "Color theme" (gradient swatches)
 * sections. Selecting closes the menu, like the web DropdownMenu.
 */
export function ThemeMenu({
  trigger,
}: {
  trigger: (open: (event: GestureResponderEvent) => void) => React.ReactNode;
}) {
  const menu = useDropdown();
  const { mode, setMode, theme, setTheme } = useTheme();

  return (
    <>
      {trigger(menu.open)}

      <Dropdown
        visible={menu.visible}
        anchor={menu.anchor}
        onClose={menu.close}
        width={232}
      >
        {/* Appearance */}
        <Text className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
          Appearance
        </Text>
        {MODES.map(({ value, label }) => {
          const active = mode === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setMode(value);
                menu.close();
              }}
              className="flex-row items-center justify-between rounded-lg px-2.5 py-2 active:bg-foreground/6"
            >
              <View className="flex-row items-center gap-2.5">
                {/* Rounded SQUARE chip (web uses rounded-lg) — explicit radius
                    since NativeWind's rounded-* is unreliable on these Views */}
                <View
                  className={cn(
                    "h-6 w-6 items-center justify-center",
                    active
                      ? "border border-primary/20 bg-primary/12"
                      : "bg-foreground/5",
                  )}
                  style={{ borderRadius: 8 }}
                >
                  {value === "light" && (
                    <Icon
                      as={Sun}
                      size={12}
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                  )}
                  {value === "dark" && (
                    <Icon
                      as={Moon}
                      size={12}
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                  )}
                  {value === "system" && (
                    <View
                      className={cn(
                        "h-2 w-2 rounded-full opacity-70",
                        active ? "bg-primary" : "bg-muted-foreground",
                      )}
                    />
                  )}
                </View>
                <Text className="text-[13px] font-medium text-foreground">{label}</Text>
              </View>
              <CheckPill active={active} />
            </Pressable>
          );
        })}

        <DropdownSeparator />

        {/* Color theme */}
        <Text className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
          Color theme
        </Text>
        {THEMES.map((t) => {
          const active = theme === t;
          const color = THEME_SWATCH[t];
          return (
            <Pressable
              key={t}
              onPress={() => {
                setTheme(t);
                menu.close();
              }}
              className="flex-row items-center justify-between rounded-lg px-2.5 py-2 active:bg-foreground/6"
            >
              <View className="flex-row items-center gap-2.5">
                <GlossySwatch id={t} color={color} />
                <Text className="text-[13px] font-medium text-foreground">
                  {THEME_LABELS[t]}
                </Text>
              </View>
              <CheckPill active={active} />
            </Pressable>
          );
        })}
      </Dropdown>
    </>
  );
}

/** Convenience: the round moon/sun trigger used in the top toolbar. */
export function ModeToggle() {
  const { isDark } = useTheme();
  return (
    <ThemeMenu
      trigger={(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          onPress={open}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-foreground/8"
        >
          <Icon as={isDark ? Moon : Sun} size={17} className="text-muted-foreground" />
        </Pressable>
      )}
    />
  );
}
