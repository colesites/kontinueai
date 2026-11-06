// Device-local app preferences. Read anywhere with useAppSettings(); every
// value here is applied somewhere in the app (see the comment on each field).
import { useSyncExternalStore } from "react";
import type { KodeAgentMode } from "@/lib/kode-tools";
import type { KodeEffort } from "@repo/ai/lib/kode";

export type TextSize = "small" | "default" | "large";

export type AppSettings = {
  /** ChatInput: Enter sends (true) or ⌘/Ctrl+Enter sends (false). */
  sendOnEnter: boolean;
  /** Home + Kode chats: show the floating message navigator. */
  showTurnNavigator: boolean;
  /** PlanView: model a new Kode session starts with. */
  defaultKodeModel: string | null;
  /** PlanView: permission mode a new Kode session starts with. */
  defaultKodeMode: KodeAgentMode;
  /** Root zoom level for all UI text. */
  textSize: TextSize;
  /** Turns off animations and transitions app-wide. */
  reduceMotion: boolean;
  /** Kode: use the model's fast variant when available (Pro/Max). */
  kodeFastMode: boolean;
  /** Kode reasoning effort ("off" where the model allows it). */
  kodeReasoning: KodeEffort | "off";
  /** Kode context budget in tokens (null = default). Drives the meter + compaction. */
  kodeContextWindow: number | null;
  /** Settings → Providers: the user's own CLI agents (Claude Code, Codex,
   *  Cursor, ACP agents). Enabled ones add their models to the Kode picker. */
  kodeProviders: ProviderInstance[];
  /** Re-check CLI install / version / sign-in every N seconds (0 = off). */
  kodeCliHealthInterval: number;
};

/** "acp" = any agent started with an Agent Client Protocol command. */
export type ProviderKind = "claude" | "codex" | "cursor" | "acp";
/** Known ACP agents (sets the default command, logo and update method). */
export type AcpPreset = "gemini" | "opencode" | "custom";

export type CliConfigSetting = {
  /** Command name or full path to the binary. */
  binaryPath: string;
  /** Config folder (CLAUDE_CONFIG_DIR / CODEX_HOME). */
  homeDir: string;
  /** Extra arguments added to every turn, as typed. */
  launchArgs: string;
  /** ACP: command that starts the agent, as typed. */
  command: string;
  /** ACP: sign-in method id used by Sign in. */
  authMethod: string;
};

export type CliModelSetting = {
  /** Model ids turned off in Settings → Providers. */
  disabled: string[];
  /** Models the user added by id. */
  custom: { id: string; name: string }[];
};

/** Environment variable for an instance. Secret values live in the keychain
 *  (value is "" here); plain ones are stored with the setting. */
export type ProviderVariable = { name: string; value: string; secret: boolean };

export type ProviderInstance = {
  /** Unique id (letters, digits, "-" or "_"). Used in model ids and the keychain. */
  id: string;
  kind: ProviderKind;
  preset?: AcpPreset;
  label: string;
  /** Optional marker color shown in the picker. */
  accent: string | null;
  enabled: boolean;
  /** Claude Code, Codex and Cursor are always listed and cannot be removed. */
  builtIn: boolean;
  config: CliConfigSetting;
  variables: ProviderVariable[];
  models: CliModelSetting;
};

export const EMPTY_CLI_MODELS: CliModelSetting = { disabled: [], custom: [] };

export const EMPTY_CLI_CONFIG: CliConfigSetting = {
  binaryPath: "",
  homeDir: "",
  launchArgs: "",
  command: "",
  authMethod: "",
};

const builtIn = (id: "claude" | "codex" | "cursor", label: string): ProviderInstance => ({
  id,
  kind: id,
  label,
  accent: null,
  enabled: false,
  builtIn: true,
  config: EMPTY_CLI_CONFIG,
  variables: [],
  models: EMPTY_CLI_MODELS,
});

export const DEFAULT_PROVIDERS: ProviderInstance[] = [
  builtIn("claude", "Claude Code"),
  builtIn("codex", "Codex"),
  builtIn("cursor", "Cursor"),
];

export const DEFAULT_SETTINGS: AppSettings = {
  sendOnEnter: true,
  showTurnNavigator: true,
  defaultKodeModel: null,
  defaultKodeMode: "supervised",
  textSize: "default",
  reduceMotion: false,
  kodeFastMode: false,
  kodeReasoning: "high",
  kodeContextWindow: null,
  kodeProviders: DEFAULT_PROVIDERS,
  kodeCliHealthInterval: 300,
};

/** Fill in missing fields and make sure the built-in providers exist. Also
 *  carries over settings saved by the earlier per-CLI format. */
function normalizeProviders(saved: Record<string, unknown>): ProviderInstance[] {
  type Legacy = Partial<Record<"claude" | "codex" | "cursor", unknown>>;
  const legacyOn = (saved.kodeCliProviders ?? {}) as Legacy;
  const legacyConfig = (saved.kodeCliConfig ?? {}) as Legacy;
  const legacyModels = (saved.kodeCliModels ?? {}) as Legacy;
  const list = Array.isArray(saved.kodeProviders) ? (saved.kodeProviders as ProviderInstance[]) : [];
  const fill = (p: ProviderInstance): ProviderInstance => ({
    ...p,
    accent: p.accent ?? null,
    config: { ...EMPTY_CLI_CONFIG, ...p.config },
    variables: p.variables ?? [],
    models: { ...EMPTY_CLI_MODELS, ...p.models },
  });
  const result = list.map(fill);
  for (const base of DEFAULT_PROVIDERS) {
    if (result.some((p) => p.id === base.id)) continue;
    const id = base.id as "claude" | "codex" | "cursor";
    result.push(
      fill({
        ...base,
        enabled: legacyOn[id] === true,
        config: { ...EMPTY_CLI_CONFIG, ...(legacyConfig[id] as object) },
        models: { ...EMPTY_CLI_MODELS, ...(legacyModels[id] as object) },
      }),
    );
  }
  // Built-ins first, in their usual order, then added providers.
  const order = (p: ProviderInstance) =>
    p.builtIn ? DEFAULT_PROVIDERS.findIndex((b) => b.id === p.id) : DEFAULT_PROVIDERS.length;
  return result.sort((a, b) => order(a) - order(b));
}

const STORAGE_KEY = "kontinue.settings.v1";
const ZOOM: Record<TextSize, string> = { small: "0.92", default: "1", large: "1.08" };

let current: AppSettings = load();
const listeners = new Set<() => void>();

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<AppSettings> & Record<string, unknown>;
    const { kodeCliProviders: _a, kodeCliConfig: _b, kodeCliModels: _c, ...rest } = saved;
    void _a;
    void _b;
    void _c;
    return {
      ...DEFAULT_SETTINGS,
      ...rest,
      kodeProviders: normalizeProviders(saved),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function apply(settings: AppSettings) {
  const root = document.documentElement;
  root.style.setProperty("zoom", ZOOM[settings.textSize]);
  root.classList.toggle("reduce-motion", settings.reduceMotion);
}

export function getSettings(): AppSettings {
  return current;
}

export function updateSettings(patch: Partial<AppSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: the change still applies for this session.
  }
  apply(current);
  for (const listener of listeners) listener();
}

export function resetSettings() {
  updateSettings(DEFAULT_SETTINGS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Call once at startup so saved text size / motion apply before first paint. */
export function installAppSettings() {
  apply(current);
}
