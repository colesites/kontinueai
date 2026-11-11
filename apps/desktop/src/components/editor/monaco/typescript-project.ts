// Real TypeScript/JavaScript diagnostics for the file editor.
//
// Monaco's TypeScript service only sees what it's given, so for the open
// file we find the project's tsconfig/jsconfig (following `extends` and
// solution-style `references`), map its compilerOptions, and load:
//   - the project's own sources, so relative and `paths` imports resolve;
//   - declaration files from the project's node_modules for every imported
//     package (and the packages those import), so unresolved imports, wrong
//     exports and type errors are reported for real.
// Semantic checks stay off until that is loaded, so there is no flash of
// false "Cannot find module" errors.

import { invoke } from "@tauri-apps/api/core";
import { monaco, typescript } from "./monaco";
import * as tsMode from "monaco-editor/languages/features/typescript/tsMode";

type CompilerOptions = typescript.CompilerOptions;
type TextFile = { path: string; content: string };
type TypePackage = { name: string; files: TextFile[]; truncated: boolean };

const SOURCE_EXT = /\.(?:d\.)?(?:[cm]?tsx?|[cm]?jsx?)$/i;
const TS_EXT = /\.[cm]?tsx?$/i;
// Build output and bundles that are never imported as source.
const GENERATED = /(^|\/)(dist|build|out|coverage|\.next|\.turbo|\.vercel|target)\/|\.min\.js$|\.bundle\.js$/;
const MAX_SOURCE_FILES = 4000;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGES = 220;

// ---------------------------------------------------------------------------
// Paths and URIs. TypeScript builds module paths by appending to the
// importing file's URI string, so libraries are keyed the same way.

function rootUri(root: string): string {
  return monaco.Uri.file(root).toString();
}

export function fileUri(root: string, rel: string): monaco.Uri {
  return monaco.Uri.file(`${root.replace(/\/$/, "")}/${rel}`);
}

function libKey(root: string, rel: string): string {
  return `${rootUri(root)}/${rel}`;
}

function dirname(rel: string): string {
  const index = rel.lastIndexOf("/");
  return index === -1 ? "" : rel.slice(0, index);
}

/** Join and normalize root-relative paths; null when it leaves the root. */
function joinRel(base: string, rel: string): string | null {
  const parts = base ? base.split("/") : [];
  for (const part of rel.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

// ---------------------------------------------------------------------------
// tsconfig

/** JSON with comments and trailing commas → value. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

type RawConfig = {
  extends?: string | string[];
  compilerOptions?: CompilerOptions;
  include?: string[];
  files?: string[];
  references?: Array<{ path: string }>;
};

type Config = { dir: string; options: CompilerOptions; include: string[]; isJsConfig: boolean };

async function readText(root: string, paths: string[]): Promise<TextFile[]> {
  if (!paths.length) return [];
  return invoke<TextFile[]>("editor_read_text_files", { root, paths, maxBytes: 4 * 1024 * 1024 }).catch(() => []);
}

async function readConfig(root: string, path: string, depth = 0): Promise<{ raw: RawConfig; options: CompilerOptions; dir: string } | null> {
  if (depth > 6) return null;
  const [file] = await readText(root, [path]);
  if (!file) return null;
  let raw: RawConfig;
  try {
    raw = parseJsonc(file.content) as RawConfig;
  } catch {
    return null;
  }
  const dir = dirname(path);
  let options: CompilerOptions = {};
  const parents = typeof raw.extends === "string" ? [raw.extends] : (raw.extends ?? []);
  for (const parent of parents) {
    const candidates: string[] = [];
    if (parent.startsWith(".") || parent.startsWith("/")) {
      const joined = joinRel(dir, parent);
      if (joined) candidates.push(joined.endsWith(".json") ? joined : `${joined}.json`, `${joined}/tsconfig.json`);
    } else {
      // A package, e.g. "@tsconfig/node20/tsconfig.json" or "expo/tsconfig.base".
      for (const level of ancestors(dir)) {
        const base = joinRel(level, `node_modules/${parent}`);
        if (base) candidates.push(base.endsWith(".json") ? base : `${base}.json`, `${base}/tsconfig.json`);
      }
    }
    for (const candidate of candidates) {
      const loaded = await readConfig(root, candidate, depth + 1);
      if (loaded) {
        options = { ...options, ...rebaseOptions(loaded.options, loaded.dir, dir) };
        break;
      }
    }
  }
  options = { ...options, ...(raw.compilerOptions ?? {}) };
  return { raw, options, dir };
}

/** Paths in an extended config are relative to that config; rebase them. */
function rebaseOptions(options: CompilerOptions, from: string, to: string): CompilerOptions {
  if (from === to) return options;
  const out = { ...options };
  const rebase = (value: string) => {
    const abs = joinRel(from, value);
    if (abs === null) return value;
    const fromParts = to ? to.split("/") : [];
    const absParts = abs ? abs.split("/") : [];
    let common = 0;
    while (common < fromParts.length && fromParts[common] === absParts[common]) common++;
    return [...fromParts.slice(common).map(() => ".."), ...absParts.slice(common)].join("/") || ".";
  };
  if (typeof out.baseUrl === "string") out.baseUrl = rebase(out.baseUrl);
  else if (out.paths && typeof out.paths === "object") out.baseUrl = rebase(".");
  return out;
}

/** `dir`, its parents, up to the root (""). */
function ancestors(dir: string): string[] {
  const levels: string[] = [];
  for (;;) {
    levels.push(dir);
    if (!dir) return levels;
    dir = dirname(dir);
  }
}

/** The tsconfig/jsconfig that applies to `path`. */
async function findConfig(root: string, path: string): Promise<Config> {
  const levels = ancestors(dirname(path));
  const candidates = levels.flatMap((level) => [level ? `${level}/tsconfig.json` : "tsconfig.json", level ? `${level}/jsconfig.json` : "jsconfig.json"]);
  const found = new Set((await readText(root, candidates)).map((f) => f.path));
  const configPath = candidates.find((c) => found.has(c));
  if (!configPath) return { dir: "", options: {}, include: [], isJsConfig: false };
  let loaded = await readConfig(root, configPath);
  if (!loaded) return { dir: dirname(configPath), options: {}, include: [], isJsConfig: configPath.endsWith("jsconfig.json") };
  // Solution-style config (Vite, Nx): the real options live in a reference.
  if (loaded.raw.references?.length && (!loaded.raw.compilerOptions || (loaded.raw.files && loaded.raw.files.length === 0))) {
    const base = loaded.dir;
    const fileInDir = base ? path.slice(base.length + 1) : path;
    let best: typeof loaded | null = null;
    for (const ref of loaded.raw.references) {
      const refPath = joinRel(base, ref.path.endsWith(".json") ? ref.path : `${ref.path}/tsconfig.json`);
      if (!refPath) continue;
      const candidate = await readConfig(root, refPath);
      if (!candidate) continue;
      const include = candidate.raw.include ?? [];
      const covers = include.some((pattern) => {
        const prefix = pattern.replace(/^\.\//, "").split(/[*{]/)[0].replace(/\/$/, "");
        return !prefix || fileInDir === prefix || fileInDir.startsWith(`${prefix}/`);
      });
      if (covers) {
        best = candidate;
        break;
      }
      best ??= candidate;
    }
    if (best) loaded = { ...best, options: { ...loaded.options, ...best.options } };
  }
  return {
    dir: loaded.dir,
    options: loaded.options,
    include: loaded.raw.include ?? [],
    isJsConfig: configPath.endsWith("jsconfig.json"),
  };
}

// ---------------------------------------------------------------------------
// compilerOptions → TypeScript API form

const TARGETS: Record<string, number> = {
  es3: 0, es5: 1, es6: 2, es2015: 2, es2016: 3, es2017: 4, es2018: 5, es2019: 6, es2020: 7, es2021: 8, es2022: 9, es2023: 10, es2024: 11, esnext: 99,
};
const MODULES: Record<string, number> = {
  none: 0, commonjs: 1, amd: 2, umd: 3, system: 4, es6: 5, es2015: 5, es2020: 6, es2022: 7, esnext: 99, node16: 100, node18: 101, node20: 102, nodenext: 199, preserve: 200,
};
const RESOLUTION: Record<string, number> = { classic: 1, node: 2, node10: 2, node16: 3, nodenext: 99, bundler: 100 };
const JSX: Record<string, number> = { preserve: 1, react: 2, "react-native": 3, "react-jsx": 4, "react-jsxdev": 5 };
const DETECTION: Record<string, number> = { legacy: 1, auto: 2, force: 3 };
// Options that only affect emit or project builds.
const DROPPED = new Set([
  "outDir", "outFile", "rootDir", "rootDirs", "declarationDir", "tsBuildInfoFile", "incremental", "composite", "declaration",
  "declarationMap", "emitDeclarationOnly", "sourceMap", "inlineSourceMap", "inlineSources", "typeRoots", "plugins", "build",
  "watch", "diagnostics", "extendedDiagnostics", "listFiles", "traceResolution", "generateCpuProfile", "noEmitOnError",
]);

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function toCompilerOptions(root: string, config: Config, typeNames: string[]): CompilerOptions {
  const raw = config.options as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) if (!DROPPED.has(key)) out[key] = value;

  if (raw.target !== undefined) out.target = TARGETS[lower(raw.target)] ?? 99;
  else out.target = 99;
  if (raw.module !== undefined) out.module = MODULES[lower(raw.module)] ?? 99;
  else out.module = 99;
  if (raw.moduleResolution !== undefined) out.moduleResolution = RESOLUTION[lower(raw.moduleResolution)] ?? 2;
  else {
    const module = out.module as number;
    out.moduleResolution = module >= 100 && module < 200 ? 99 : module === 200 ? 100 : 2;
  }
  if (raw.jsx !== undefined) out.jsx = JSX[lower(raw.jsx)] ?? 4;
  // Without any config, assume a modern React setup rather than flagging JSX.
  else if (Object.keys(raw).length === 0) out.jsx = 4;
  if (raw.moduleDetection !== undefined) out.moduleDetection = DETECTION[lower(raw.moduleDetection)] ?? 2;
  if (raw.newLine !== undefined) out.newLine = lower(raw.newLine) === "crlf" ? 0 : 1;
  if (Array.isArray(raw.lib)) {
    out.lib = (raw.lib as string[]).map((lib) => `lib.${lib.toLowerCase()}.d.ts`);
  }
  // Paths become absolute file URIs so resolution works without a cwd.
  const baseDir = typeof raw.baseUrl === "string" ? joinRel(config.dir, raw.baseUrl) : config.dir;
  if (typeof raw.baseUrl === "string" || raw.paths) out.baseUrl = baseDir ? `${rootUri(root)}/${baseDir}` : rootUri(root);
  out.types = Array.isArray(raw.types) ? raw.types : typeNames;
  out.allowJs = raw.allowJs ?? config.isJsConfig;
  out.allowNonTsExtensions = true;
  out.noEmit = true;
  return out as CompilerOptions;
}

// ---------------------------------------------------------------------------
// Imports

const IMPORT_RE =
  /(?:^|[\s;(,{}])(?:import|export)\s*(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"'\n]+)["']|\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)|\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)|\/\/\/\s*<reference\s+types\s*=\s*["']([^"'\n]+)["']/g;

function specifiers(text: string): string[] {
  const out: string[] = [];
  IMPORT_RE.lastIndex = 0;
  for (let m = IMPORT_RE.exec(text); m; m = IMPORT_RE.exec(text)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (spec) out.push(spec);
  }
  return out;
}

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "dns", "domain", "events", "fs",
  "http", "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline",
  "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`; null for relative/aliased imports. */
function packageName(spec: string, aliases: RegExp[]): string | null {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.includes(":") && !spec.startsWith("node:")) return null;
  if (aliases.some((alias) => alias.test(spec))) return null;
  if (spec.startsWith("node:")) return "node";
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (NODE_BUILTINS.has(name)) return "node";
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) return null;
  return name;
}

function aliasPatterns(options: CompilerOptions): RegExp[] {
  const paths = options.paths as Record<string, string[]> | undefined;
  if (!paths) return [];
  return Object.keys(paths).map((key) => new RegExp(`^${key.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace("\\*", ".*").replace("*", ".*")}$`));
}

// ---------------------------------------------------------------------------
// Project state

type Project = {
  root: string;
  configDir: string;
  ready: Promise<void>;
};

const libs = new Map<string, string>(); // lib key → content
const loadedPackages = new Set<string>(); // `${root}|${name}`
const loadedSourceScopes = new Set<string>(); // `${root}|${dir}`
const projects = new Map<string, Project>(); // `${root}|${configDir}`
let active: string | null = null;
let flushTimer: number | null = null;

function flushLibs() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    const list = [...libs].map(([filePath, content]) => ({ filePath, content }));
    typescript.typescriptDefaults.setExtraLibs(list);
    typescript.javascriptDefaults.setExtraLibs(list);
  }, 0);
}

function setSemantic(on: boolean, checkJs: boolean) {
  typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: !on,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: !on,
  });
  // Like VS Code: plain JavaScript only gets type errors with checkJs.
  typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: !(on && checkJs),
    noSyntaxValidation: false,
    noSuggestionDiagnostics: !on,
  });
}

/** Folders the config's `include` names, relative to the root. */
function includePrefixes(config: Config): string[] {
  const patterns = config.include.length ? config.include : ["."];
  return patterns
    .map((pattern) => joinRel(config.dir, pattern.split(/[*{]/)[0].replace(/\/$/, "") || "."))
    .filter((dir): dir is string => dir !== null);
}

async function loadSources(root: string, config: Config, options: CompilerOptions) {
  const scopes = new Set<string>([config.dir]);
  // Folders reached through `paths` (monorepo packages) or `include` outside the config dir.
  const baseDir = typeof config.options.baseUrl === "string" ? joinRel(config.dir, config.options.baseUrl) : config.dir;
  for (const targets of Object.values((options.paths as Record<string, string[]>) ?? {})) {
    for (const target of targets) {
      const dir = joinRel(baseDir ?? config.dir, target.split("*")[0]);
      if (dir !== null) scopes.add(dir.replace(/\/$/, ""));
    }
  }
  for (const pattern of config.include) {
    if (!pattern.startsWith("..")) continue;
    const dir = joinRel(config.dir, pattern.split(/[*{]/)[0]);
    if (dir !== null) scopes.add(dir.replace(/\/$/, ""));
  }
  const fresh = [...scopes].filter((dir) => !loadedSourceScopes.has(`${root}|${dir}`));
  if (!fresh.length) return;
  for (const dir of fresh) loadedSourceScopes.add(`${root}|${dir}`);
  const all = await invoke<string[]>("kode_list_project_files", { root }).catch(() => [] as string[]);
  const allowJs = Boolean(options.allowJs || options.checkJs);
  const isWanted = (path: string) =>
    (allowJs ? SOURCE_EXT.test(path) : TS_EXT.test(path)) ||
    (Boolean(options.resolveJsonModule) && path.endsWith(".json") && !path.endsWith("lock.json"));
  // Files the config includes come first, so build output or generated
  // code elsewhere can't use up the budget.
  const included = includePrefixes(config);
  const rank = (path: string) => (included.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ? 0 : 1);
  const wanted = all
    .filter((path) => fresh.some((dir) => !dir || path === dir || path.startsWith(`${dir}/`)))
    .filter((path) => isWanted(path) && !GENERATED.test(path))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_SOURCE_FILES);
  const files = await invoke<TextFile[]>("editor_read_text_files", { root, paths: wanted, maxBytes: MAX_SOURCE_BYTES }).catch(() => []);
  for (const file of files) libs.set(fileUri(root, file.path).toString(), file.content);
}

async function loadPackages(root: string, fromDir: string, texts: string[], aliases: RegExp[], extra: string[]) {
  let queue = new Set<string>(extra);
  for (const text of texts) for (const spec of specifiers(text)) {
    const name = packageName(spec, aliases);
    if (name) queue.add(name);
  }
  for (let round = 0; round < 4 && queue.size; round++) {
    const names = [...queue].filter((name) => !loadedPackages.has(`${root}|${name}`)).slice(0, MAX_PACKAGES);
    queue = new Set();
    if (!names.length || loadedPackages.size > MAX_PACKAGES * 3) break;
    for (const name of names) loadedPackages.add(`${root}|${name}`);
    const found = await invoke<TypePackage[]>("editor_type_packages", { root, fromDir, packages: names }).catch(() => []);
    for (const pkg of found) {
      for (const file of pkg.files) {
        libs.set(libKey(root, file.path), file.content);
        if (/\.d\.[cm]?ts$/.test(file.path) || /\.tsx?$/.test(file.path)) {
          for (const spec of specifiers(file.content)) {
            const name = packageName(spec, []);
            if (name && !loadedPackages.has(`${root}|${name}`)) queue.add(name);
          }
        }
      }
    }
  }
}

function setOptions(options: CompilerOptions) {
  typescript.typescriptDefaults.setCompilerOptions(options);
  typescript.javascriptDefaults.setCompilerOptions({ ...options, allowJs: true, checkJs: Boolean(options.checkJs) });
}

async function loadProject(root: string, config: Config, openText: string) {
  const typeNames = await invoke<string[]>("editor_type_roots", { root, fromDir: config.dir }).catch(() => [] as string[]);
  const options = toCompilerOptions(root, config, typeNames);
  // Syntax checks, completions and hovers work while project files load.
  setOptions(options);
  await loadSources(root, config, options);
  const sourceTexts = [openText, ...[...libs].filter(([key]) => key.startsWith(rootUri(root))).map(([, text]) => text)];
  const extra = ((options.types as string[]) ?? []).map((type) => (type.startsWith("@") ? type.split("/").slice(0, 2).join("/") : type.split("/")[0]));
  const jsx = options.jsx as number | undefined;
  if (jsx === 4 || jsx === 5) extra.push(typeof options.jsxImportSource === "string" ? options.jsxImportSource : "react");
  await loadPackages(root, config.dir, sourceTexts, aliasPatterns(options), extra);
  // Libraries first, then turn on semantic checks: one worker restart with everything.
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = null;
  const list = [...libs].map(([filePath, content]) => ({ filePath, content }));
  typescript.typescriptDefaults.setExtraLibs(list);
  typescript.javascriptDefaults.setExtraLibs(list);
  setSemantic(true, Boolean(options.checkJs));
}

/** Before any worker starts: no semantic errors until the project is loaded. */
export function initTypeScriptDefaults() {
  setSemantic(false, false);
  typescript.typescriptDefaults.setEagerModelSync(true);
  typescript.javascriptDefaults.setEagerModelSync(true);
}

/**
 * Make sure TypeScript knows the project that `path` belongs to. Cheap after
 * the first call for a given config; switching between configs updates the
 * compiler options.
 */
export function ensureTypeScriptProject(root: string, path: string, openText: string): Promise<void> {
  return (async () => {
    ensureReactLanguage();
    const config = await findConfig(root, path);
    const key = `${root}|${config.dir}`;
    let project = projects.get(key);
    if (!project) {
      project = { root, configDir: config.dir, ready: loadProject(root, config, openText).catch((error) => console.error("TypeScript project", error)) };
      projects.set(key, project);
      active = key;
    } else if (active !== key) {
      active = key;
      const typeNames = await invoke<string[]>("editor_type_roots", { root, fromDir: config.dir }).catch(() => [] as string[]);
      setOptions(toCompilerOptions(root, config, typeNames));
    }
    await project.ready;
  })();
}

/** Keep a source file's library copy in sync after it changes on disk. */
export function updateProjectSource(root: string, path: string, content: string | null) {
  const key = fileUri(root, path).toString();
  if (!libs.has(key) && content === null) return;
  if (!SOURCE_EXT.test(path)) return;
  if (content === null) libs.delete(key);
  else libs.set(key, content);
  flushLibs();
}

// ---------------------------------------------------------------------------
// .tsx files use their own language id (so they get the TSX grammar) but the
// same TypeScript service as .ts files.

let reactReady = false;

function ensureReactLanguage() {
  if (reactReady) return;
  reactReady = true;
  // Monaco starts the TypeScript service when the first `typescript` model
  // appears; a tiny model makes sure it exists for .tsx-only sessions.
  if (!monaco.editor.getModel(monaco.Uri.parse("inmemory://kontinue/boot.ts"))) {
    monaco.editor.createModel("export {};\n", "typescript", monaco.Uri.parse("inmemory://kontinue/boot.ts"));
  }
  const worker = async (...uris: monaco.Uri[]) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const get = await typescript.getTypeScriptWorker();
        return await get(...uris);
      } catch (error) {
        if (attempt > 50) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };
  const id = "typescriptreact";
  const libFiles = new tsMode.LibFiles(worker);
  monaco.languages.registerCompletionItemProvider(id, new tsMode.SuggestAdapter(worker));
  monaco.languages.registerSignatureHelpProvider(id, new tsMode.SignatureHelpAdapter(worker));
  monaco.languages.registerHoverProvider(id, new tsMode.QuickInfoAdapter(worker));
  monaco.languages.registerDocumentHighlightProvider(id, new tsMode.DocumentHighlightAdapter(worker));
  monaco.languages.registerDefinitionProvider(id, new tsMode.DefinitionAdapter(libFiles, worker));
  monaco.languages.registerReferenceProvider(id, new tsMode.ReferenceAdapter(libFiles, worker));
  monaco.languages.registerDocumentSymbolProvider(id, new tsMode.OutlineAdapter(worker));
  monaco.languages.registerRenameProvider(id, new tsMode.RenameAdapter(libFiles, worker));
  monaco.languages.registerDocumentRangeFormattingEditProvider(id, new tsMode.FormatAdapter(worker));
  monaco.languages.registerOnTypeFormattingEditProvider(id, new tsMode.FormatOnTypeAdapter(worker));
  monaco.languages.registerCodeActionProvider(id, new tsMode.CodeActionAdaptor(worker));
  monaco.languages.registerInlayHintsProvider(id, new tsMode.InlayHintsAdapter(worker));
  new tsMode.DiagnosticsAdapter(libFiles, typescript.typescriptDefaults, id, worker);
}

export function isScriptLanguage(id: string) {
  return id === "typescript" || id === "typescriptreact" || id === "javascript";
}
