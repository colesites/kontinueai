// Color themes — mirrors apps/web/src/lib/theme.ts. React Native can't parse
// `oklch(...)` color strings at runtime, so the web oklch primaries are
// converted to perceptually-matched hex here (used both as the menu swatch and
// the runtime `--primary` override applied via NativeWind `vars()`).

export const THEMES = [
  "default",
  "emerald",
  "chelsea",
  "amethyst",
  "normal",
] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  default: "Default",
  emerald: "Emerald",
  chelsea: "Chelsea Blue",
  amethyst: "Amethyst",
  normal: "Normal",
};

// Swatch shown in the theme menu (matches web's getThemePrimaryColor).
export const THEME_SWATCH: Record<Theme, string> = {
  default: "#ec2d96",
  emerald: "#10b981",
  chelsea: "#2156c9",
  amethyst: "#a435f0",
  normal: "#0a0a0a",
};

export type Mode = "light" | "dark" | "system";

/** Runtime `--primary` / `--primary-foreground` for the active theme + scheme. */
export function themePrimary(
  theme: Theme,
  isDark: boolean,
): { primary: string; primaryForeground: string } {
  if (theme === "normal") {
    return isDark
      ? { primary: "#fafafa", primaryForeground: "#0a0a0a" }
      : { primary: "#0a0a0a", primaryForeground: "#fafafa" };
  }
  return { primary: THEME_SWATCH[theme], primaryForeground: "#ffffff" };
}
