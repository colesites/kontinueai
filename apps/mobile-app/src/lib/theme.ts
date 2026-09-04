// Color themes. Every value comes from `src/theme/tokens.generated.ts`, which
// is generated from `packages/tailwind-config/shared-styles.css` — the same
// file the web app consumes. Nothing here may hardcode a color: run
// `bun run theme:sync` after changing the shared stylesheet.

import {
  DEFAULT_THEME,
  THEME_LABELS,
  THEME_TOKENS,
  THEMES,
  type ColorScheme,
  type Theme,
  type TokenName,
} from "@/theme/tokens.generated";

export {
  DEFAULT_THEME,
  THEME_LABELS,
  THEME_TOKENS,
  THEMES,
  type ColorScheme,
  type Theme,
  type TokenName,
};

export type Mode = "light" | "dark" | "system";

/** Resolved token set for a theme in the active scheme. */
export function themeTokens(
  theme: Theme,
  isDark: boolean,
): Record<TokenName, string> {
  return THEME_TOKENS[theme][isDark ? "dark" : "light"];
}

/**
 * Swatch shown in the theme menu. Web draws the same dot from each theme's
 * primary, so read it from the tokens rather than keeping a parallel list.
 */
export function themeSwatch(theme: Theme, isDark: boolean): string {
  return themeTokens(theme, isDark).primary;
}

/**
 * Normalises a persisted theme id.
 *
 * Mirrors web's `getSavedTheme` migrations: `default` was this app's id for
 * what web calls `pink`, and `chelsea-blue` is an older id for `chelsea`.
 * Anything unrecognised falls back to the default theme.
 */
export function normalizeTheme(saved: string | null | undefined): Theme {
  if (saved === "default") return "pink";
  if (saved === "chelsea-blue") return "chelsea";
  if (saved && (THEMES as readonly string[]).includes(saved)) {
    return saved as Theme;
  }
  return DEFAULT_THEME;
}

export function getThemeLabel(theme: Theme): string {
  return THEME_LABELS[theme];
}
