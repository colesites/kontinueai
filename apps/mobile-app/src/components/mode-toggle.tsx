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
function lighten(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16),
    amt = Math.round(2.55 * (percent * 100)),
    R = (num >> 16) + amt,
    G = ((num >> 8) & 0x00ff) + amt,
    B = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 0 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 0 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 0 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

/** Web ModeToggle's color swatches — gradient fills matching CSS radial-gradient. */
export function GlossySwatch({ id, color }: { id: string; color: string }) {
  const fillId = `swatch-fill-${id}`;
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        shadowColor: color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
        elevation: 2,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.08)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={22} height={22}>
        <Defs>
          <RadialGradient id={fillId} cx="30%" cy="30%" r="70%">
            <Stop offset="0" stopColor={lighten(color, 0.15)} />
            <Stop offset="0.7" stopColor={color} />
            <Stop offset="1" stopColor={color} />
          </RadialGradient>
        </Defs>
        <Circle cx={11} cy={11} r={11} fill={`url(#${fillId})`} />
      </Svg>
    </View>
  );
}

/** Web ModeToggle's check pill — primary circle, only when active. */
function CheckPill({ active }: { active: boolean }) {
  const { primary } = useTheme();
  if (!active) return <View style={{ width: 20, height: 20 }} />;
  return (
    <View
      className="items-center justify-center rounded-full bg-primary"
      style={{
        width: 20,
        height: 20,
        shadowColor: primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
        elevation: 2,
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
        <Text className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
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
                    "items-center justify-center",
                    active
                      ? "border border-primary/20 bg-primary/12"
                      : "bg-foreground/5",
                  )}
                  style={{ width: 24, height: 24, borderRadius: 8 }}
                >
                  {value === "light" && (
                    <Icon
                      as={Sun}
                      size={15}
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                  )}
                  {value === "dark" && (
                    <Icon
                      as={Moon}
                      size={15}
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                  )}
                  {value === "system" && (
                    <View
                      className={cn(
                        "h-2.5 w-2.5 rounded-full opacity-70",
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
        <Text className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
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
