import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Check, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/components/theme-provider";
import { GlossySwatch } from "@/components/mode-toggle";
import { THEMES, THEME_LABELS, themeSwatch, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ONBOARDING_KEY = "theme-onboarding-completed";

const THEME_DESCRIPTIONS: Record<Theme, string> = {
  normal: "Clean black & white",
  pink: "Classic pink & red tones",
  emerald: "Fresh green & teal vibes",
  chelsea: "Royal blue with gold accents",
  amethyst: "Bold violet & plum palette",
};

/**
 * First-visit theme picker — mirrors web ThemeOnboarding. Shows once (flag
 * persisted in SecureStore); live-previews the palette as the user taps.
 */
export function ThemeOnboarding() {
  const { theme, setTheme, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Theme>(theme);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    SecureStore.getItemAsync(ONBOARDING_KEY)
      .then((done) => {
        if (active && !done) timer = setTimeout(() => setOpen(true), 500);
      })
      .catch((error) => {
        console.warn("[theme-onboarding] preference unavailable", error);
      });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const preview = (t: Theme) => {
    setSelected(t);
    setTheme(t); // live preview
  };

  const finish = () => {
    setTheme(selected);
    SecureStore.setItemAsync(ONBOARDING_KEY, "true").catch(() => {});
    setOpen(false);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={finish}
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover">
          <LinearGradient
            colors={["transparent", themeSwatch(selected, isDark), "transparent"]}
            className="h-px"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close theme picker"
            onPress={finish}
            className="absolute right-4 top-4 z-10 h-11 w-11 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:bg-foreground/10"
          >
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Pressable>
          <View className="px-7 pb-6 pt-7">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Personalize
            </Text>
            <Text className="mt-1.5 text-[22px] font-semibold tracking-tight text-foreground">
              Choose your theme
            </Text>
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
              Pick a color palette that feels like you. You can change this
              anytime from the theme menu.
            </Text>

            <View className="mt-5 gap-1.5">
              {THEMES.map((t) => {
                const isSelected = selected === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => preview(t)}
                    className={cn(
                      "flex-row items-center gap-3.5 rounded-xl px-3 py-2.5",
                      isSelected
                        ? "border border-primary/30 bg-primary/10"
                        : "border border-border active:bg-accent",
                    )}
                  >
                    <View className={isSelected ? "rounded-full border-2 border-primary/40 p-1" : "p-1"}>
                      <GlossySwatch id={`onboarding-${t}`} color={themeSwatch(t, isDark)} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14px] font-medium text-foreground">
                        {THEME_LABELS[t]}
                      </Text>
                      <Text className="text-[12px] text-muted-foreground">
                        {THEME_DESCRIPTIONS[t]}
                      </Text>
                    </View>
                    {isSelected ? (
                      <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                        <Icon
                          as={Check}
                          size={13}
                          strokeWidth={3}
                          className="text-primary-foreground"
                        />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={finish}
              className="mt-7 h-12 items-center justify-center rounded-full bg-primary active:opacity-90"
            >
              <Text className="text-[15px] font-semibold text-primary-foreground">
                Continue
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
