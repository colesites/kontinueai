import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Check, Moon, Sun } from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/components/theme-provider";
import { THEMES, THEME_LABELS, THEME_SWATCH, type Mode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MODES: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function CheckBadge({ active }: { active: boolean }) {
  if (!active) return <View className="h-5 w-5" />;
  return (
    <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
      <Icon as={Check} size={12} strokeWidth={3} className="text-primary-foreground" />
    </View>
  );
}

/**
 * Theme menu — Appearance (Light/Dark/System) + Color theme palette. Renders a
 * glassy popover anchored to the top-right, mirroring the web ModeToggle.
 * Pass a `trigger` render-prop (moon button on home, palette button in sidebar).
 */
export function ThemeMenu({
  trigger,
}: {
  trigger: (open: () => void) => React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const { mode, setMode, theme, setTheme } = useTheme();

  return (
    <>
      {trigger(() => setVisible(true))}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable className="flex-1 bg-black/40" onPress={() => setVisible(false)}>
          <View className="absolute right-4 top-24 w-64 rounded-2xl border border-border bg-popover p-2 shadow-2xl">
            {/* Appearance */}
            <Text className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Appearance
            </Text>
            {MODES.map(({ value, label }) => {
              const active = mode === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setMode(value)}
                  className="flex-row items-center justify-between rounded-lg px-2.5 py-2 active:bg-accent"
                >
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className={cn(
                        "h-6 w-6 items-center justify-center rounded-lg",
                        active ? "bg-primary/15" : "bg-foreground/5",
                      )}
                    >
                      {value === "light" && (
                        <Icon as={Sun} size={13} className={active ? "text-primary" : "text-muted-foreground"} />
                      )}
                      {value === "dark" && (
                        <Icon as={Moon} size={13} className={active ? "text-primary" : "text-muted-foreground"} />
                      )}
                      {value === "system" && (
                        <View className="h-2 w-2 rounded-full bg-muted-foreground" />
                      )}
                    </View>
                    <Text className="text-[13px] font-medium text-foreground">{label}</Text>
                  </View>
                  <CheckBadge active={active} />
                </Pressable>
              );
            })}

            <View className="my-2 h-px bg-border" />

            {/* Color theme */}
            <Text className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Color theme
            </Text>
            {THEMES.map((t) => {
              const active = theme === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTheme(t)}
                  className="flex-row items-center justify-between rounded-lg px-2.5 py-2 active:bg-accent"
                >
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className="h-6 w-6 rounded-full"
                      style={{ backgroundColor: THEME_SWATCH[t] }}
                    />
                    <Text className="text-[13px] font-medium text-foreground">
                      {THEME_LABELS[t]}
                    </Text>
                  </View>
                  <CheckBadge active={active} />
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Convenience: the round moon/sun trigger used in the home top bar. */
export function ModeToggle() {
  const { isDark } = useTheme();
  return (
    <ThemeMenu
      trigger={(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          onPress={open}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-accent"
        >
          <Icon as={isDark ? Moon : Sun} size={18} className="text-muted-foreground" />
        </Pressable>
      )}
    />
  );
}
