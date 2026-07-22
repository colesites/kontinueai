import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { View } from "react-native";
import { useColorScheme as useNativewindColorScheme, vars } from "nativewind";
import * as SecureStore from "expo-secure-store";

import {
  THEME_SWATCH,
  themePrimary,
  type Mode,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
  /** Active primary color (hex) for inline styles (icons, dots, glows). */
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  destructive: string;
};

const SURFACES: Record<
  Theme,
  {
    dark: { background: string; foreground: string; mutedForeground: string; border: string; destructive: string };
    light: { background: string; foreground: string; mutedForeground: string; border: string; destructive: string };
  }
> = {
  default: {
    dark: {
      background: "#181217",
      foreground: "#f5f1f3",
      mutedForeground: "#b692a8",
      border: "#49303e",
      destructive: "#ef5350",
    },
    light: {
      background: "#ffffff",
      foreground: "#251f23",
      mutedForeground: "#765c6b",
      border: "#d8c6d0",
      destructive: "#d9363e",
    },
  },
  emerald: {
    dark: {
      background: "#19251e",
      foreground: "#f2f7f4",
      mutedForeground: "#aac3b4",
      border: "#4d735d",
      destructive: "#ef5350",
    },
    light: {
      background: "#ffffff",
      foreground: "#1f2622",
      mutedForeground: "#5f806e",
      border: "#cce0d5",
      destructive: "#d9363e",
    },
  },
  chelsea: {
    dark: {
      background: "#121626",
      foreground: "#f2f4f7",
      mutedForeground: "#9bb1d4",
      border: "#2e3a59",
      destructive: "#ef5350",
    },
    light: {
      background: "#f8f9fc",
      foreground: "#1a2035",
      mutedForeground: "#657795",
      border: "#cfd8e3",
      destructive: "#d9363e",
    },
  },
  amethyst: {
    dark: {
      background: "#191225",
      foreground: "#f5f2f7",
      mutedForeground: "#b8a2d4",
      border: "#4a2f73",
      destructive: "#ef5350",
    },
    light: {
      background: "#ffffff",
      foreground: "#231f26",
      mutedForeground: "#735f8c",
      border: "#dcd5e3",
      destructive: "#d9363e",
    },
  },
  normal: {
    dark: {
      background: "#000000",
      foreground: "#fafdff",
      mutedForeground: "#999999",
      border: "#333333",
      destructive: "#ef5350",
    },
    light: {
      background: "#ffffff",
      foreground: "#1a1a1a",
      mutedForeground: "#666666",
      border: "#ebebeb",
      destructive: "#d9363e",
    },
  },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = "kontinue-color-theme";
const MODE_KEY = "kontinue-appearance-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  // Kontinue is dark-first.
  const [mode, setModeState] = useState<Mode>("dark");
  const [theme, setTheme] = useState<Theme>("default");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      SecureStore.getItemAsync(MODE_KEY),
      SecureStore.getItemAsync(THEME_KEY),
    ])
      .then(([savedMode, savedTheme]) => {
        if (!active) return;
        if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
          setModeState(savedMode);
        }
        if (
          savedTheme === "default" ||
          savedTheme === "emerald" ||
          savedTheme === "chelsea" ||
          savedTheme === "amethyst" ||
          savedTheme === "normal"
        ) {
          setTheme(savedTheme);
        }
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
  const { primary, primaryForeground } = themePrimary(theme, isDark);
  const themeSurfaces = SURFACES[theme] ?? SURFACES.default;
  const surfaces = themeSurfaces[isDark ? "dark" : "light"];

  // No manual useMemo: React Compiler memoizes this (and couldn't preserve
  // the hand-written dependency list, which failed its lint).
  const value: ThemeContextValue = {
    mode,
    setMode: setModeState,
    theme,
    setTheme,
    isDark,
    primary: theme === "default" ? THEME_SWATCH.default : primary,
    primaryForeground,
    ...surfaces,
  };

  return (
    <ThemeContext.Provider value={value}>
      {/*
       * `dark` class drives the `.dark { --token }` block so the dark palette
       * actually applies (nothing else in the RN tree sets it). Explicit inline
       * `flex: 1` guarantees the root fills the screen regardless of className
       * processing. `vars()` then overrides the brand tokens for the active
       * color theme so `bg-primary` / `text-primary` follow the palette.
       */}
      <View
        className={isDark ? "bg-background" : "bg-background light"}
        style={[
          { flex: 1 },
          vars({
            "--primary": primary,
            "--primary-foreground": primaryForeground,
            "--ring": primary,
            "--background": surfaces.background,
            "--foreground": surfaces.foreground,
            "--muted-foreground": surfaces.mutedForeground,
            "--border": surfaces.border,
          }),
        ]}
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
