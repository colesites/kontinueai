import { createContext, useContext, useEffect, useState } from "react";
import { View } from "react-native";
import { useColorScheme as useNativewindColorScheme, vars } from "nativewind";
import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_THEME,
  normalizeTheme,
  themeTokens,
  type Mode,
  type Theme,
  type TokenName,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
  /** Every resolved token, for anything that needs one we don't alias below. */
  tokens: Record<TokenName, string>;
  /** Aliases for the tokens used in inline styles (icons, dots, glows). */
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  destructive: string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = "kontinue-color-theme";
const MODE_KEY = "kontinue-appearance-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  // Kontinue is dark-first.
  const [mode, setModeState] = useState<Mode>("dark");
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      SecureStore.getItemAsync(MODE_KEY),
      SecureStore.getItemAsync(THEME_KEY),
    ])
      .then(([savedMode, savedTheme]) => {
        if (!active) return;
        if (
          savedMode === "light" ||
          savedMode === "dark" ||
          savedMode === "system"
        ) {
          setModeState(savedMode);
        }
        // Migrates this app's retired `default` id onto web's `pink`, and
        // falls back to the default theme for anything unrecognised.
        if (savedTheme) setTheme(normalizeTheme(savedTheme));
      })
      .catch(() => {
        // Secure storage can be unavailable in a restricted development shell;
        // keep the in-memory theme usable in that case.
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void SecureStore.setItemAsync(MODE_KEY, mode);
    void SecureStore.setItemAsync(THEME_KEY, theme);
  }, [hydrated, mode, theme]);

  useEffect(() => {
    // nativewind accepts "system" at runtime even though its type omits it.
    (setColorScheme as (m: Mode) => void)(mode);
  }, [mode, setColorScheme]);

  const isDark = mode === "system" ? colorScheme !== "light" : mode !== "light";
  const tokens = themeTokens(theme, isDark);

  // Every token is forwarded, so `bg-card`, `bg-muted`, `text-accent` and the
  // rest follow the active theme instead of being stuck on the palette baked
  // into the stylesheet at build time.
  const cssVars = vars(
    Object.fromEntries(
      Object.entries(tokens).map(([name, value]) => [`--${name}`, value]),
    ),
  );

  // No manual useMemo: React Compiler memoizes this (and couldn't preserve
  // the hand-written dependency list, which failed its lint).
  const value: ThemeContextValue = {
    mode,
    setMode: setModeState,
    theme,
    setTheme,
    isDark,
    tokens,
    primary: tokens.primary,
    primaryForeground: tokens["primary-foreground"],
    background: tokens.background,
    foreground: tokens.foreground,
    mutedForeground: tokens["muted-foreground"],
    border: tokens.border,
    destructive: tokens.destructive,
  };

  return (
    <ThemeContext.Provider value={value}>
      {/*
       * The `light` class flips the stylesheet's opt-in light block, which
       * covers the frame before `vars()` resolves. `vars()` then supplies the
       * full token set for the active theme. Explicit inline `flex: 1`
       * guarantees the root fills the screen regardless of className
       * processing.
       */}
      <View
        className={isDark ? "bg-background" : "bg-background light"}
        style={[{ flex: 1 }, cssVars]}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
