/**
 * Generates the mobile design tokens from the web source of truth.
 *
 * `packages/tailwind-config/shared-styles.css` is the ONLY place a Kontinue
 * color is authored. This script parses its per-theme blocks and emits two
 * generated artifacts under `src/theme/`:
 *
 *   tokens.generated.css - the token blocks with `oklch(...)` preserved
 *                          verbatim, compiled by lightningcss at build time.
 *   tokens.generated.ts  - the same tokens converted to hex, because React
 *                          Native's color parser (@react-native/normalize-colors)
 *                          accepts hex/rgb/hsl/hwb but NOT oklch, and the
 *                          runtime `vars()` overrides plus inline styles need
 *                          real color strings.
 *
 * Run `bun run theme:sync` after any change to shared-styles.css. Never edit
 * the generated files, and never hand-write a color in this app.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const SOURCE = join(appRoot, "../../packages/tailwind-config/shared-styles.css");
const OUT_DIR = join(appRoot, "src/theme");

/**
 * Theme ids and order mirror `apps/web/src/lib/theme.ts` exactly, including
 * `normal` first as the default.
 */
const THEMES = ["normal", "pink", "emerald", "chelsea", "amethyst"];

/** Labels mirror web's THEME_LABELS. */
const THEME_LABELS = {
  normal: "Default",
  pink: "Pink",
  emerald: "Emerald",
  chelsea: "Chelsea Blue",
  amethyst: "Amethyst",
};

const css = readFileSync(SOURCE, "utf8");

/**
 * Extracts one declaration block by a selector that must appear in the
 * comma-separated selector list. Web distinguishes light from dark with a
 * `.dark` compound selector, so the light block is the one whose selector list
 * carries the theme without `.dark`.
 */
function findBlock(theme, scheme) {
  const wantDark = scheme === "dark";
  const blockRe = /([^{}]+)\{([^}]*)\}/g;
  let match;
  while ((match = blockRe.exec(css))) {
    const selector = match[1];
    const body = match[2];
    if (!body.includes("--background:")) continue;

    const selectors = selector
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const hit = selectors.some((s) => {
      const isDark = s.includes(".dark");
      if (isDark !== wantDark) return false;
      return (
        s.includes(`.theme-${theme}`) || s.includes(`data-color-theme="${theme}"`)
      );
    });
    if (hit) return body;
  }
  throw new Error(`No ${scheme} block found for theme "${theme}"`);
}

function parseTokens(body) {
  const tokens = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(body))) {
    tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

/** oklch() -> #rrggbb. Gamut-clipped in sRGB, which is what RN can display. */
function oklchToHex(value) {
  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*\)$/i.exec(
    value,
  );
  if (!m) return null;

  const pct = (raw, scale) =>
    raw.endsWith("%") ? (parseFloat(raw) / 100) * scale : parseFloat(raw);

  const L = pct(m[1], 1);
  const C = pct(m[2], 0.4);
  const H = parseFloat(m[3]);

  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // OKLab -> linear sRGB (Björn Ottosson's matrices).
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];

  const channel = (c) => {
    const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
    return byte.toString(16).padStart(2, "0");
  };

  return `#${lin.map(channel).join("")}`;
}

/** Colors need conversion; `--radius` and friends pass through untouched. */
function toRuntimeValue(name, value) {
  if (value.startsWith("oklch(")) {
    const hex = oklchToHex(value);
    if (!hex) throw new Error(`Unparseable oklch for --${name}: ${value}`);
    return hex;
  }
  return value;
}

const themeData = {};
for (const theme of THEMES) {
  themeData[theme] = {
    light: parseTokens(findBlock(theme, "light")),
    dark: parseTokens(findBlock(theme, "dark")),
  };
}

// Token set = whatever the source defines, so new web tokens flow through
// without editing this script. Sorted for a stable diff.
const tokenNames = [
  ...new Set(
    THEMES.flatMap((t) => [
      ...Object.keys(themeData[t].light),
      ...Object.keys(themeData[t].dark),
    ]),
  ),
].sort();

const isColor = (value) =>
  value.startsWith("oklch(") ||
  value.startsWith("#") ||
  value.startsWith("rgb") ||
  value.startsWith("hsl");

/**
 * Only colors reach the TypeScript runtime tokens. Non-color tokens such as
 * `--radius` carry `rem` units, which the stylesheet resolves at build time but
 * a runtime `vars()` override would hand to React Native unparsed.
 */
const colorTokenNames = tokenNames.filter((name) =>
  THEMES.some((t) =>
    ["light", "dark"].some((s) => {
      const v = themeData[t][s][name];
      return v !== undefined && isColor(v);
    }),
  ),
);

const BANNER = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: packages/tailwind-config/shared-styles.css
 * Regenerate: bun run theme:sync (from apps/mobile-app)
 *
 * Every Kontinue color is authored on the web side. Editing this file by hand
 * reintroduces the drift it exists to prevent.
 */`;

// ---------------------------------------------------------------------------
// tokens.generated.css
// ---------------------------------------------------------------------------

const DEFAULT_THEME = THEMES[0];

const cssBlock = (tokens, indent = "  ") =>
  tokenNames
    .filter((n) => tokens[n] !== undefined)
    .map((n) => `${indent}--${n}: ${tokens[n]};`)
    .join("\n");

let cssOut = `${BANNER}\n\n`;
cssOut += `/*\n * The app is dark-first: the default theme's DARK values live in \`:root\` so\n * they apply with no class attached, and light mode is opt-in via \`.light\`.\n * ThemeProvider overrides every token at runtime with \`vars()\`; these blocks\n * are the pre-hydration fallback and the source for build-time class lookups.\n */\n`;
cssOut += `:root {\n${cssBlock(themeData[DEFAULT_THEME].dark)}\n}\n\n`;
cssOut += `.light {\n${cssBlock(themeData[DEFAULT_THEME].light)}\n}\n`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "tokens.generated.css"), cssOut);

// ---------------------------------------------------------------------------
// tokens.generated.ts
// ---------------------------------------------------------------------------

const runtime = {};
for (const theme of THEMES) {
  runtime[theme] = { light: {}, dark: {} };
  for (const scheme of ["light", "dark"]) {
    for (const name of colorTokenNames) {
      // A dark block may omit a token it shares with light; fall back so every
      // theme exposes the complete set and the record type stays total.
      const raw = themeData[theme][scheme][name] ?? themeData[theme].light[name];
      if (raw === undefined) continue;
      runtime[theme][scheme][name] = toRuntimeValue(name, raw);
    }
  }
}

const q = (s) => JSON.stringify(s);

let tsOut = `${BANNER}\n\n`;
tsOut += `export const THEMES = [\n${THEMES.map((t) => `\t${q(t)},`).join("\n")}\n] as const;\n\n`;
tsOut += `export type Theme = (typeof THEMES)[number];\n\n`;
tsOut += `/** The dark-first default, mirroring web's fallback theme. */\n`;
tsOut += `export const DEFAULT_THEME: Theme = ${q(DEFAULT_THEME)};\n\n`;
tsOut += `export const THEME_LABELS: Record<Theme, string> = {\n${THEMES.map(
  (t) => `\t${t}: ${q(THEME_LABELS[t])},`,
).join("\n")}\n};\n\n`;
tsOut += `export const TOKEN_NAMES = [\n${colorTokenNames.map((n) => `\t${q(n)},`).join("\n")}\n] as const;\n\n`;
tsOut += `export type TokenName = (typeof TOKEN_NAMES)[number];\n\n`;
tsOut += `export type ColorScheme = "light" | "dark";\n\n`;
tsOut += `/**\n * Every token for every theme, in both schemes, converted from the web\n * \`oklch()\` values to hex because React Native cannot parse oklch at runtime.\n */\n`;
tsOut += `export const THEME_TOKENS: Record<\n\tTheme,\n\tRecord<ColorScheme, Record<TokenName, string>>\n> = {\n`;
for (const theme of THEMES) {
  tsOut += `\t${theme}: {\n`;
  for (const scheme of ["light", "dark"]) {
    tsOut += `\t\t${scheme}: {\n`;
    for (const name of colorTokenNames) {
      const v = runtime[theme][scheme][name];
      if (v === undefined) continue;
      tsOut += `\t\t\t${q(name)}: ${q(v)},\n`;
    }
    tsOut += `\t\t},\n`;
  }
  tsOut += `\t},\n`;
}
tsOut += `};\n`;

writeFileSync(join(OUT_DIR, "tokens.generated.ts"), tsOut);

console.log(
  `theme:sync - ${THEMES.length} themes x 2 schemes x ${tokenNames.length} tokens -> src/theme/tokens.generated.{css,ts}`,
);
