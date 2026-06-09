import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { View } from "react-native";
import { useColorScheme as useNativewindColorScheme, vars } from "nativewind";

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
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  // Kontinue is dark-first.
  const [mode, setModeState] = useState<Mode>("dark");
  const [theme, setTheme] = useState<Theme>("default");

  useEffect(() => {
    // nativewind accepts "system" at runtime even though its type omits it.
    (setColorScheme as (m: Mode) => void)(mode);
  }, [mode, setColorScheme]);

  const isDark = mode === "system" ? colorScheme !== "light" : mode !== "light";
  const { primary, primaryForeground } = themePrimary(theme, isDark);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode: setModeState,
      theme,
      setTheme,
      isDark,
      primary: theme === "default" ? THEME_SWATCH.default : primary,
    }),
    [mode, theme, isDark, primary],
  );

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
