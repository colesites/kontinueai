// Editor themes: GitHub's VS Code themes for syntax and editor colors, with
// Kontinue's own canvas, borders and accent on top so the editor sits in the
// app instead of looking like a VS Code window pasted in.

import { useSyncExternalStore } from "react";
import type { ThemeRegistrationRaw } from "shiki/types";
import { monaco } from "./monaco";
import { applyTextMateTheme, refreshTokens } from "./textmate";

export type ThemeMode = "light" | "dark";

const loaders: Record<ThemeMode, () => Promise<{ default: unknown }>> = {
  dark: () => import("shiki/themes/github-dark-default.mjs"),
  light: () => import("shiki/themes/github-light-default.mjs"),
};

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

let probe: CanvasRenderingContext2D | null = null;

/** Resolve a CSS color (var, rgba, oklch) to #rrggbb, painted over `under`. */
function cssColor(value: string, under = "#000000"): string {
  probe ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", {
    willReadFrequently: true,
  });
  if (!probe) return under;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = under;
  probe.fillRect(0, 0, 1, 1);
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function cssVar(name: string, fallback: string, under?: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? cssColor(raw, under) : fallback;
}

/** `#rrggbb` + alpha (0-1) → `#rrggbbaa`. */
function alpha(hex: string, amount: number): string {
  return `${hex.slice(0, 7)}${Math.round(amount * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

let current: ThemeMode | null = null;
let applied = "vs";
const themeListeners = new Set<() => void>();

/** The Monaco theme in use, for editors that need its name. */
export function useThemeName(): string {
  return useSyncExternalStore(
    (listener) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    () => applied,
  );
}
let pending: Promise<void> | null = null;

export function currentThemeMode(): ThemeMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Define and apply the theme for the app's current light/dark mode. */
export function applyTheme(mode: ThemeMode = currentThemeMode()): Promise<void> {
  if (mode === current && pending) return pending;
  current = mode;
  pending = (async () => {
    const theme = (await loaders[mode]()).default as ThemeRegistrationRaw;
    if (current !== mode) return;
    const dark = mode === "dark";
    const background = cssVar("--background", dark ? "#0a0a0a" : "#faf9fe");
    const foreground = theme.colors?.["editor.foreground"] ?? (dark ? "#e6edf3" : "#1f2328");
    const brand = cssVar("--brand", dark ? "#a855f7" : "#9333ea", background);
    const muted = cssVar("--muted-foreground", dark ? "#8a8a98" : "#655e75", background);
    const popover = dark ? cssVar("--surface-3", "#171717", background) : "#ffffff";
    const edge = cssVar("--edge-strong", dark ? "#262626" : "#d9d3e6", background);

    const colors: Record<string, string> = {};
    for (const [key, value] of Object.entries(theme.colors ?? {})) {
      if (typeof value === "string" && HEX.test(value)) colors[key] = value;
    }
    Object.assign(colors, {
      "editor.background": background,
      "editorGutter.background": background,
      "minimap.background": background,
      "editorStickyScroll.background": background,
      "editorStickyScrollHover.background": alpha(foreground, 0.05),
      "editor.lineHighlightBackground": alpha(foreground, dark ? 0.04 : 0.035),
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": alpha(muted, 0.55),
      "editorLineNumber.activeForeground": foreground,
      "editorCursor.foreground": brand,
      "editor.selectionBackground": alpha(brand, dark ? 0.32 : 0.22),
      "editor.inactiveSelectionBackground": alpha(brand, dark ? 0.16 : 0.12),
      "editor.selectionHighlightBackground": alpha(brand, dark ? 0.16 : 0.12),
      "editor.wordHighlightBackground": alpha(foreground, 0.08),
      "editor.wordHighlightStrongBackground": alpha(brand, 0.16),
      "editor.findMatchBackground": alpha(brand, 0.45),
      "editor.findMatchHighlightBackground": alpha(brand, 0.2),
      "editorIndentGuide.background1": alpha(foreground, dark ? 0.07 : 0.08),
      "editorIndentGuide.activeBackground1": alpha(foreground, dark ? 0.2 : 0.22),
      "editorWhitespace.foreground": alpha(muted, 0.35),
      "editorRuler.foreground": alpha(foreground, 0.08),
      "editorWidget.background": popover,
      "editorWidget.border": edge,
      "editorSuggestWidget.background": popover,
      "editorSuggestWidget.border": edge,
      "editorSuggestWidget.selectedBackground": alpha(brand, dark ? 0.22 : 0.12),
      "editorHoverWidget.background": popover,
      "editorHoverWidget.border": edge,
      "quickInput.background": popover,
      "focusBorder": alpha(brand, 0.6),
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": alpha(foreground, dark ? 0.12 : 0.14),
      "scrollbarSlider.hoverBackground": alpha(foreground, dark ? 0.2 : 0.22),
      "scrollbarSlider.activeBackground": alpha(brand, 0.45),
      "editorOverviewRuler.border": "#00000000",
      "minimapSlider.background": alpha(foreground, 0.06),
      "minimapSlider.hoverBackground": alpha(foreground, 0.1),
      "minimapSlider.activeBackground": alpha(foreground, 0.14),
    });

    const encodedTokensColors = applyTextMateTheme(theme, foreground);
    const name = `kontinue-${mode}`;
    monaco.editor.defineTheme(name, {
      base: dark ? "vs-dark" : "vs",
      inherit: false,
      rules: [],
      encodedTokensColors,
      colors,
    });
    monaco.editor.setTheme(name);
    refreshTokens();
    applied = name;
    for (const listener of themeListeners) listener();
  })();
  return pending;
}

let watching = false;

/** Follow the app's light/dark switch. */
export function followAppTheme() {
  if (watching) return;
  watching = true;
  const observer = new MutationObserver(() => {
    const mode = currentThemeMode();
    if (mode !== current) void applyTheme(mode);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}
