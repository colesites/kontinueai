// TextMate highlighting for Monaco, the way VS Code does it: vscode-textmate
// tokenizes each line with the language's grammar and returns encoded tokens
// (color, font style, token type and embedded language), which Monaco renders
// directly. Token types mark comments, strings and regexes, so bracket
// colorization and auto-closing skip them, and embedded languages (CSS in
// HTML, TS in Vue) get their own comment style for Cmd+/.

import { INITIAL, Registry, type IGrammar, type IRawTheme, type StateStack } from "shiki/textmate";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { LanguageRegistration, ThemeRegistrationRaw } from "shiki/types";
import { monaco } from "./monaco";
import { EMBEDDED_SCOPES, LANGUAGES, languageDef, type LanguageDef } from "./languages";

const grammars = new Map<string, LanguageRegistration>(); // scopeName → grammar
const injections = new Map<string, string[]>(); // target scope → injected scopes

const engine = createJavaScriptRegexEngine({ forgiving: true });

const registry = new Registry({
  onigLib: {
    createOnigScanner: (patterns) => engine.createScanner(patterns),
    createOnigString: (text) => engine.createString(text),
  },
  loadGrammar: (scopeName) => (grammars.get(scopeName) as never) ?? null,
  getInjections: (scopeName) => injections.get(scopeName),
});

function addGrammars(list: LanguageRegistration[]) {
  for (const lang of list) {
    if (grammars.has(lang.scopeName)) continue;
    grammars.set(lang.scopeName, lang);
    for (const target of lang.injectTo ?? []) {
      const current = injections.get(target) ?? [];
      if (!current.includes(lang.scopeName)) injections.set(target, [...current, lang.scopeName]);
    }
  }
}

// ---------------------------------------------------------------------------
// Colors: vscode-textmate numbers colors by its theme's color map; Monaco by
// the theme's `encodedTokensColors`. We hand Monaco a de-duplicated list and
// translate ids per token.

let remap = new Uint16Array(1);
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function sixDigitHex(color: string | undefined): string | null {
  if (!color || !HEX.test(color)) return null;
  let hex = color.slice(1);
  if (hex.length <= 4) hex = [...hex.slice(0, 3)].map((c) => c + c).join("");
  return `#${hex.slice(0, 6).toUpperCase()}`;
}

/** Apply a theme to the tokenizer; returns the colors Monaco must use. */
export function applyTextMateTheme(theme: ThemeRegistrationRaw, foreground: string): string[] {
  const settings = [
    { settings: { foreground, background: theme.colors?.["editor.background"] ?? "#000000" } },
    ...((theme.tokenColors ?? theme.settings ?? []) as IRawTheme["settings"]),
  ];
  registry.setTheme({ name: theme.name, settings } as IRawTheme);
  const tmColors = registry.getColorMap();
  // Index 0 is unused by both; the editor foreground goes first so it is id 1.
  const monacoColors: string[] = [sixDigitHex(foreground) ?? "#000000"];
  const ids = new Map(monacoColors.map((c, i) => [c, i + 1]));
  remap = new Uint16Array(Math.max(tmColors.length, 1));
  for (let i = 1; i < tmColors.length; i++) {
    const hex = sixDigitHex(tmColors[i]) ?? monacoColors[0];
    let id = ids.get(hex);
    if (!id) {
      monacoColors.push(hex);
      id = monacoColors.length;
      ids.set(hex, id);
    }
    remap[i] = id;
  }
  return monacoColors;
}

// Encoded token layout (shared by vscode-textmate and Monaco):
// language 0-7, token type 8-9, balanced brackets 10, font style 11-14,
// foreground 15-23, background 24-31.
const FOREGROUND_MASK = 0x00ff8000;
const BACKGROUND_MASK = 0xff000000;
const KEEP_MASK = ~(FOREGROUND_MASK | BACKGROUND_MASK) >>> 0;
const MAX_LINE = 20_000;
const TIME_LIMIT_MS = 500;

class TextMateState implements monaco.languages.IState {
  constructor(readonly stack: StateStack) {}
  clone() {
    return new TextMateState(this.stack.clone());
  }
  equals(other: monaco.languages.IState) {
    return other instanceof TextMateState && (other.stack === this.stack || other.stack.equals(this.stack));
  }
}

function tokensProvider(grammar: IGrammar, languageId: string): monaco.languages.EncodedTokensProvider {
  const plainMetadata = (monaco.languages.getEncodedLanguageId(languageId) | (1 << 15)) >>> 0;
  return {
    getInitialState: () => new TextMateState(INITIAL),
    tokenizeEncoded(line, state) {
      const prev = (state as TextMateState).stack;
      if (line.length > MAX_LINE) {
        // Very long lines (minified code) stay plain, like VS Code.
        return { tokens: new Uint32Array([0, plainMetadata]), endState: state };
      }
      const result = grammar.tokenizeLine2(line, prev, TIME_LIMIT_MS);
      const tokens = new Uint32Array(result.tokens);
      for (let i = 1; i < tokens.length; i += 2) {
        const meta = tokens[i];
        const fg = (meta & FOREGROUND_MASK) >>> 15;
        tokens[i] = ((meta & KEEP_MASK) | ((remap[fg] || 1) << 15)) >>> 0;
      }
      return {
        tokens,
        endState: result.ruleStack === prev ? state : new TextMateState(result.ruleStack),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Languages

const HOSTS_EMBEDDED_CODE = new Set(["html", "vue", "svelte", "astro", "markdown", "php"]);
const loaded = new Map<string, Promise<void>>();
const providers = new Map<string, IGrammar>();
const registered = new Set<string>();

/** Register every known language id (cheap: no grammar is loaded yet). */
export function registerLanguageIds() {
  const known = new Set(monaco.languages.getLanguages().map((lang) => lang.id));
  for (const lang of LANGUAGES) {
    if (registered.has(lang.id)) continue;
    registered.add(lang.id);
    if (!known.has(lang.id)) {
      monaco.languages.register({
        id: lang.id,
        aliases: [lang.label],
        extensions: lang.extensions,
        filenames: lang.filenames,
      });
    }
  }
}

async function loadLanguage(lang: LanguageDef) {
  const [conf, mainModule, ...embedded] = await Promise.all([
    lang.conf().catch(() => undefined),
    lang.grammar?.(),
    ...(lang.embeds ?? []).map((load) => load().catch(() => null)),
  ]);
  if (conf) monaco.languages.setLanguageConfiguration(lang.id, conf);
  // Code embedded in this language (CSS in HTML, TS in Vue) uses that
  // language's comments and brackets.
  const embeddedIds = new Set(Object.values(lang.embeddedScopes ?? {}));
  if (HOSTS_EMBEDDED_CODE.has(lang.id)) for (const id of Object.values(EMBEDDED_SCOPES)) embeddedIds.add(id);
  for (const id of embeddedIds) {
    if (id !== lang.id && !loaded.has(id)) void ensureLanguage(id, { grammar: false });
  }
  if (!mainModule) return;
  for (const module of embedded) if (module) addGrammars(module.default);
  addGrammars(mainModule.default);
  const main = mainModule.default[mainModule.default.length - 1];
  const embeddedLanguages: Record<string, number> = {};
  for (const [scope, id] of Object.entries(EMBEDDED_SCOPES)) {
    if (id !== lang.id) embeddedLanguages[scope] = monaco.languages.getEncodedLanguageId(id);
  }
  // Language-specific scopes (JSX markup) may map back to the language itself.
  for (const [scope, id] of Object.entries(lang.embeddedScopes ?? {})) {
    embeddedLanguages[scope] = monaco.languages.getEncodedLanguageId(id);
  }
  const grammar = registry.loadGrammarWithConfiguration(main.scopeName, monaco.languages.getEncodedLanguageId(lang.id), {
    embeddedLanguages,
    balancedBracketSelectors: ["*"],
    unbalancedBracketSelectors: lang.unbalancedBrackets ?? [],
  });
  if (!grammar) return;
  providers.set(lang.id, grammar);
  monaco.languages.setTokensProvider(lang.id, tokensProvider(grammar, lang.id));
}

const confOnly = new Map<string, Promise<void>>();

/**
 * Load a language's grammar and configuration (once). With
 * `{ grammar: false }` only the configuration is loaded, for languages that
 * appear embedded in another file.
 */
export function ensureLanguage(id: string, options: { grammar?: boolean } = {}): Promise<void> {
  const lang = languageDef(id);
  if (!lang) return Promise.resolve();
  if (options.grammar === false) {
    const full = loaded.get(id);
    if (full) return full;
    let pending = confOnly.get(id);
    if (!pending) {
      pending = lang
        .conf()
        .then((conf) => {
          if (conf && !loaded.has(id)) monaco.languages.setLanguageConfiguration(id, conf);
        })
        .catch(() => undefined);
      confOnly.set(id, pending);
    }
    return pending;
  }
  let pending = loaded.get(id);
  if (!pending) {
    pending = loadLanguage(lang).catch((error) => console.error(`Could not load ${id} highlighting`, error));
    loaded.set(id, pending);
  }
  return pending;
}

/** Re-tokenize every open file (after a theme change). */
export function refreshTokens() {
  for (const [id, grammar] of providers) monaco.languages.setTokensProvider(id, tokensProvider(grammar, id));
}
