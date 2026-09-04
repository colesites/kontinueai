import { describe, expect, it } from "@jest/globals";

import {
  DEFAULT_THEME,
  THEMES,
  THEME_TOKENS,
  normalizeTheme,
  themeSwatch,
  themeTokens,
} from "@/lib/theme";

// Web's list, order included. Mobile must not invent or reorder theme ids:
// they are persisted and compared against the web app's own values.
const WEB_THEMES = ["normal", "pink", "emerald", "chelsea", "amethyst"];

describe("theme tokens", () => {
  it("exposes exactly the web theme ids, in web order", () => {
    expect([...THEMES]).toEqual(WEB_THEMES);
  });

  it("defaults to the normal theme", () => {
    expect(DEFAULT_THEME).toBe("normal");
  });

  it("migrates the retired mobile-only ids onto web's", () => {
    // `default` was this app's id for what web calls `pink`.
    expect(normalizeTheme("default")).toBe("pink");
    expect(normalizeTheme("chelsea-blue")).toBe("chelsea");
  });

  it("falls back to the default for unknown or absent values", () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
    expect(normalizeTheme("solarized")).toBe(DEFAULT_THEME);
  });

  it("preserves a valid saved theme", () => {
    for (const theme of THEMES) {
      expect(normalizeTheme(theme)).toBe(theme);
    }
  });

  it("resolves every token to a React Native parseable color", () => {
    // RN's normalize-colors accepts hex/rgb/hsl/hwb but not oklch, so an
    // oklch value leaking into the runtime tokens would render as a crash or
    // a silently wrong color.
    for (const theme of THEMES) {
      for (const isDark of [true, false]) {
        const tokens = themeTokens(theme, isDark);
        for (const [name, value] of Object.entries(tokens)) {
          expect(`${theme}/${isDark}/${name}=${value}`).toMatch(
            /=#[0-9a-f]{6}$/,
          );
        }
      }
    }
  });

  it("gives light and dark distinct primaries where web does", () => {
    // The old implementation reused one hex for both schemes, which is how
    // chelsea's dark primary drifted far from web's.
    expect(THEME_TOKENS.chelsea.light.primary).not.toBe(
      THEME_TOKENS.chelsea.dark.primary,
    );
    expect(themeSwatch("chelsea", true)).toBe(THEME_TOKENS.chelsea.dark.primary);
  });
});
