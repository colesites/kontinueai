// "Use your own agent subscription" in Kode: Claude Code, Codex, Cursor and
// any Agent Client Protocol (ACP) agent such as Gemini CLI or OpenCode.
//
// Each provider is an *instance* in Settings → Providers (you can add a
// second Claude account with its own config folder, for example). Enabled
// instances add their models to Kode's picker with ids like
// "cli:<instance>:<model>". Turns run the official CLI on this machine
// (Rust: src-tauri/src/cli_agents.rs, cli_acp.rs), never go through the
// Kontinue server and never count against Kode usage. We never read or
// forward the CLIs' own credentials; secret variables the user adds are kept
// in the keychain and only read by Rust when starting the CLI.

import { Channel, invoke } from "@tauri-apps/api/core";
import { loadMcpConfigs } from "./kode-mcp";
import { isActiveAccount } from "./kode-accounts";
import { getPlugins, pluginMcpConfigs } from "./kode-plugins";
import { useSyncExternalStore } from "react";
import { KODE_MODELS } from "@repo/ai/lib/kode";
import type { ModelOption } from "@repo/ai/lib/models";
import {
  EMPTY_CLI_CONFIG,
  EMPTY_CLI_MODELS,
  getSettings,
  updateSettings,
  type AcpPreset,
  type AppSettings,
  type ProviderInstance,
  type ProviderKind,
} from "./app-settings";
import type { KodeToolStep } from "./kode-agent";
import type { KodeTodo, KodeTodoStatus } from "./kode-tools";

export type { ProviderInstance, ProviderKind, AcpPreset };

export type CliStatus = {
  /** Provider instance id. */
  instance: string;
  provider: ProviderKind;
  installed: boolean;
  version: string | null;
  path: string | null;
  /** From the CLI's own status command; null when it could not tell. */
  loggedIn: boolean | null;
  installMethod: "homebrew" | "npm" | "native" | "unknown" | null;
  /** What the Update button runs (null = no known update command). */
  updateCommand: string | null;
  /** Why the CLI could not be used. */
  error: string | null;
};

export type CliTaskResult = { success: boolean; stopped: boolean; output: string };

export type CliEvent =
  | { type: "session"; sessionId: string; model: string | null }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "toolStart"; id: string; name: string; input: unknown }
  | { type: "toolEnd"; id: string; output: string; isError: boolean }
  | { type: "todos"; items: { title: string; status: string }[] }
  | { type: "notice"; message: string };

type CliRunResult = {
  sessionId: string | null;
  text: string;
  stopped: boolean;
  error: string | null;
  /** Epoch ms when the usage limit that stopped this turn resets, if known. */
  limitResetsAt: number | null;
};

// ---------------------------------------------------------------------------
// Provider kinds and ACP presets
// ---------------------------------------------------------------------------

type KindInfo = {
  name: string;
  /** models.dev logo key. */
  logo: string;
  /** Whose plan pays ("Uses your … plan"); null when it depends on the agent. */
  plan: string | null;
  loginCommand: string | null;
  install: string;
};

const KIND_INFO: Record<Exclude<ProviderKind, "acp">, KindInfo> = {
  claude: {
    name: "Claude Code",
    logo: "anthropic",
    plan: "Claude",
    loginCommand: "claude auth login",
    install: "https://docs.anthropic.com/en/docs/claude-code/setup",
  },
  codex: {
    name: "Codex",
    logo: "openai",
    plan: "ChatGPT",
    loginCommand: "codex login",
    install: "https://developers.openai.com/codex/cli",
  },
  cursor: {
    name: "Cursor",
    logo: "cursor",
    plan: "Cursor",
    loginCommand: "cursor-agent login",
    install: "https://cursor.com/cli",
  },
};

export type AcpPresetInfo = KindInfo & {
  command: string;
  description: string;
  /** Sign-in methods the agent offers through ACP `authenticate`. */
  authMethods?: { id: string; label: string; description: string }[];
};

export const ACP_PRESETS: Record<AcpPreset, AcpPresetInfo> = {
  gemini: {
    name: "Gemini CLI",
    logo: "google",
    plan: "Google",
    loginCommand: null,
    install: "https://github.com/google-gemini/gemini-cli",
    command: "gemini --experimental-acp",
    description: "Google's agent. Sign in with your Google account, or use a Gemini or Vertex AI key.",
    authMethods: [
      { id: "oauth-personal", label: "Google account", description: "Uses your Google subscription." },
      { id: "gemini-api-key", label: "Gemini API key", description: "Billed to your key. Add GEMINI_API_KEY." },
      { id: "vertex-ai", label: "Vertex AI", description: "Billed to your Google Cloud project." },
    ],
  },
  opencode: {
    name: "OpenCode",
    logo: "opencode",
    plan: null,
    loginCommand: "opencode auth login",
    install: "https://opencode.ai/docs",
    command: "opencode acp",
    description: "Open-source agent that works with the providers you have set up in OpenCode.",
  },
  // From the ACP agent registry (agentclientprotocol.com/overview/agents).
  // Commands checked 2026-11-09 against each agent's docs / npm package. The
  // command stays editable when adding the provider.
  copilot: {
    name: "GitHub Copilot",
    logo: "github-copilot",
    plan: "GitHub Copilot",
    loginCommand: "copilot",
    install: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server",
    command: "copilot --acp --stdio",
    description: "GitHub's coding agent. Uses your Copilot subscription.",
  },
  amp: {
    name: "Amp",
    logo: "amp",
    plan: "Amp",
    loginCommand: "amp login",
    install: "https://github.com/tao12345666333/amp-acp",
    command: "npx -y amp-acp",
    description: "Sourcegraph's Amp through its ACP adapter. Uses your Amp account.",
  },
  qwen: {
    name: "Qwen Code",
    logo: "alibaba",
    plan: "Qwen",
    loginCommand: null,
    install: "https://github.com/QwenLM/qwen-code",
    command: "qwen --acp",
    description: "Alibaba's terminal agent. Sign in with Qwen OAuth or an API key.",
  },
  goose: {
    name: "Goose",
    logo: "",
    plan: null,
    loginCommand: "goose configure",
    install: "https://block.github.io/goose/docs/getting-started/installation",
    command: "goose acp",
    description: "Block's open-source agent, with the providers you set up in Goose.",
  },
  auggie: {
    name: "Auggie",
    logo: "",
    plan: "Augment",
    loginCommand: "auggie login",
    install: "https://docs.augmentcode.com/cli/overview",
    command: "auggie --acp",
    description: "Augment Code's agent. Uses your Augment plan.",
  },
  kimi: {
    name: "Kimi CLI",
    logo: "moonshotai",
    plan: "Moonshot",
    loginCommand: null,
    install: "https://github.com/MoonshotAI/kimi-cli",
    command: "kimi acp",
    description: "Moonshot's Kimi agent.",
  },
  "claude-acp": {
    name: "Claude Code (ACP)",
    logo: "anthropic",
    plan: "Claude",
    loginCommand: "claude auth login",
    install: "https://github.com/zed-industries/claude-code-acp",
    command: "npx -y @zed-industries/claude-code-acp",
    description: "Claude Code through Zed's ACP adapter, as an alternative to the built-in Claude provider.",
  },
  "codex-acp": {
    name: "Codex (ACP)",
    logo: "openai",
    plan: "ChatGPT",
    loginCommand: "codex login",
    install: "https://github.com/zed-industries/codex-acp",
    command: "npx -y @zed-industries/codex-acp",
    description: "Codex through Zed's ACP adapter.",
  },
  custom: {
    name: "ACP agent",
    logo: "",
    plan: null,
    loginCommand: null,
    install: "https://agentclientprotocol.com/overview/agents",
    command: "",
    description: "Any agent that speaks the Agent Client Protocol, started with your own command.",
  },
};

function info(instance: Pick<ProviderInstance, "kind" | "preset">): KindInfo {
  return instance.kind === "acp" ? ACP_PRESETS[instance.preset ?? "custom"] : KIND_INFO[instance.kind];
}

/** "Claude Code", "Gemini CLI", … (the kind, not the user's label). */
export function kindName(instance: Pick<ProviderInstance, "kind" | "preset">): string {
  return info(instance).name;
}

export function providerLogo(instance: Pick<ProviderInstance, "kind" | "preset">): string {
  return info(instance).logo;
}

export function installUrl(instance: Pick<ProviderInstance, "kind" | "preset">): string {
  return info(instance).install;
}

/** "Uses your Claude plan", or a neutral line for agents billed elsewhere. */
export function cliPlanLabel(instance: Pick<ProviderInstance, "kind" | "preset">): string {
  const plan = info(instance).plan;
  return plan ? `Uses your ${plan} plan` : "Runs with your own account";
}

/** Terminal command that signs the CLI in, when it has one. */
export function cliLoginCommand(instance: Pick<ProviderInstance, "kind" | "preset">): string | null {
  return info(instance).loginCommand;
}

export function cliNeedsLogin(statuses: CliStatus[] | null, instanceId: string): boolean {
  return !!statuses?.some((s) => s.instance === instanceId && s.loggedIn === false);
}

// ---------------------------------------------------------------------------
// Instances (Settings → Providers)
// ---------------------------------------------------------------------------

export function getProviders(settings: AppSettings = getSettings()): ProviderInstance[] {
  return settings.kodeProviders ?? [];
}

export function getProvider(id: string, settings: AppSettings = getSettings()): ProviderInstance | undefined {
  return getProviders(settings).find((p) => p.id === id);
}

/** Update one instance, reading the latest settings so quick edits stack. */
export function updateProvider(id: string, patch: Partial<ProviderInstance>) {
  updateSettings({
    kodeProviders: getProviders().map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
}

export function addProvider(instance: ProviderInstance) {
  updateSettings({ kodeProviders: [...getProviders().filter((p) => p.id !== instance.id), instance] });
  void refreshCliProviders();
}

export function removeProvider(id: string) {
  const instance = getProvider(id);
  if (!instance || instance.builtIn) return;
  for (const variable of instance.variables.filter((v) => v.secret)) {
    void removeSecret(id, variable.name);
  }
  updateSettings({ kodeProviders: getProviders().filter((p) => p.id !== id) });
}

export const INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** A free id based on `base` ("claude-2", …). */
export function suggestInstanceId(base: string): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  const taken = new Set(getProviders().map((p) => p.id));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}

export function newInstance(
  kind: ProviderKind,
  preset: AcpPreset | undefined,
  id: string,
  label: string,
): ProviderInstance {
  return {
    id,
    kind,
    preset: kind === "acp" ? preset ?? "custom" : undefined,
    label,
    accent: null,
    enabled: true,
    builtIn: false,
    config: {
      ...EMPTY_CLI_CONFIG,
      command: kind === "acp" ? ACP_PRESETS[preset ?? "custom"].command : "",
    },
    variables: [],
    models: EMPTY_CLI_MODELS,
  };
}

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

export type CliModelInfo = {
  id: string;
  name: string;
  /** Short capability notes shown in Settings ("Reasoning", "Fast mode"). */
  tags?: string[];
  custom?: boolean;
};

const claude = (name: string, id: string, fast = false, tags = ["Reasoning"]): CliModelInfo => ({
  id,
  name,
  tags: fast ? ["Fast mode", ...tags] : tags,
});

// Claude Code accepts these names with `--model`; Codex uses OpenAI's API
// names. Cursor and ACP agents list the account's models themselves.
const BUILTIN_MODELS: Record<ProviderKind, CliModelInfo[]> = {
  claude: [
    claude("Claude Opus 5.5", "claude-opus-5-5", true),
    claude("Claude Sonnet 5.5", "claude-sonnet-5-5"),
    claude("Claude Fable 5.2", "claude-fable-5-2"),
    claude("Claude Fable 5.1", "claude-fable-5-1"),
    claude("Claude Fable 5", "claude-fable-5"),
    claude("Claude Opus 5", "claude-opus-5", true),
    claude("Claude Opus 4.8", "claude-opus-4-8", true),
    claude("Claude Opus 4.7", "claude-opus-4-7", true),
    claude("Claude Opus 4.6", "claude-opus-4-6", true),
    claude("Claude Opus 4.5", "claude-opus-4-5", true),
    claude("Claude Sonnet 5", "claude-sonnet-5"),
    claude("Claude Sonnet 4.6", "claude-sonnet-4-6"),
    claude("Claude Haiku 5.5", "claude-haiku-5-5"),
    claude("Claude Haiku 4.5", "claude-haiku-4-5", false, ["Thinking"]),
  ],
  codex: KODE_MODELS.filter((m) => m.provider === "openai").map((m) => ({
    id: m.gatewayId.replace(/^openai\//, ""),
    name: m.name,
    tags: ["Reasoning"],
  })),
  cursor: [],
  acp: [],
};

/** Agents with no model list get one entry that keeps the agent's default. */
const DEFAULT_MODEL: CliModelInfo = { id: "default", name: "Default model" };

const CLI_ID_PREFIX = "cli:";

export function cliModelId(instanceId: string, model: string): string {
  return `${CLI_ID_PREFIX}${instanceId}:${model}`;
}

/** "cli:claude:claude-opus-5-5" → { instanceId: "claude", model: "claude-opus-5-5" }. */
export function parseCliModelId(id: string | null | undefined): { instanceId: string; model: string } | null {
  if (!id?.startsWith(CLI_ID_PREFIX)) return null;
  const rest = id.slice(CLI_ID_PREFIX.length);
  const split = rest.indexOf(":");
  if (split <= 0) return null;
  return { instanceId: rest.slice(0, split), model: rest.slice(split + 1) };
}

/** Every model an instance offers: built in, from the account, and custom. */
export function cliModelCatalog(
  instance: ProviderInstance,
  accountModels: Record<string, CliModelInfo[]>,
): CliModelInfo[] {
  const seen = new Set<string>();
  const listed = [
    ...BUILTIN_MODELS[instance.kind],
    ...(accountModels[instance.id] ?? []),
    ...instance.models.custom.map((m) => ({ ...m, custom: true })),
  ].filter((m) => !seen.has(m.id) && seen.add(m.id));
  return listed.length > 0 || instance.kind !== "acp" ? listed : [DEFAULT_MODEL];
}

/** Picker entry type for CLI models (the provider is a logo key). */
export type CliModelOption = Omit<ModelOption, "provider"> & {
  provider: string;
  /** Instance accent color, shown as a marker in the picker. */
  accent?: string | null;
  /** Instance label, used as the picker group. */
  group?: string;
};

/** Enabled models of every switched-on, installed instance, for the picker. */
export function cliPickerModels(settings: AppSettings, store: CliStore): CliModelOption[] {
  return getProviders(settings).flatMap((instance) => {
    const installed = store.statuses?.some((s) => s.instance === instance.id && s.installed);
    if (!instance.enabled || !installed) return [];
    // Several accounts of one provider: only the active one is in the picker.
    if (!isActiveAccount(instance, settings)) return [];
    const disabled = new Set(instance.models.disabled);
    return cliModelCatalog(instance, store.accountModels)
      .filter((m) => !disabled.has(m.id))
      .map((m) => ({
        id: cliModelId(instance.id, m.id),
        name: m.name,
        provider: providerLogo(instance),
        accent: instance.accent,
        group: instance.label,
        description: `${instance.label} on this computer. ${cliPlanLabel(instance)}, not counted in Kode usage.`,
      }));
  });
}

/** Display name for a CLI model id, from its catalog when known. */
export function cliModelDisplayName(id: string): string | null {
  const parsed = parseCliModelId(id);
  if (!parsed) return null;
  const instance = getProvider(parsed.instanceId);
  const known = instance
    ? cliModelCatalog(instance, store.accountModels).find((m) => m.id === parsed.model)
    : undefined;
  return known?.name ?? parsed.model;
}

// ---------------------------------------------------------------------------
// Rust config for an instance
// ---------------------------------------------------------------------------

/** Split typed arguments like a shell would (quotes group words). */
export function parseLaunchArgs(text: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) args.push(match[1] ?? match[2] ?? match[3] ?? "");
  return args;
}

function rustConfig(instance: ProviderInstance) {
  const config = instance.config;
  return {
    instance: instance.id,
    binaryPath: config.binaryPath.trim(),
    homeDir: config.homeDir.trim(),
    launchArgs: parseLaunchArgs(config.launchArgs),
    command: parseLaunchArgs(config.command),
    preset: instance.preset ?? "",
    authMethod: config.authMethod,
    env: Object.fromEntries(
      instance.variables.filter((v) => !v.secret && v.name.trim()).map((v) => [v.name.trim(), v.value]),
    ),
    secretEnv: instance.variables.filter((v) => v.secret && v.name.trim()).map((v) => v.name.trim()),
  };
}

// ---------------------------------------------------------------------------
// Secret variables (keychain; values are write-only from here)
// ---------------------------------------------------------------------------

export function saveSecret(instanceId: string, name: string, value: string): Promise<void> {
  return invoke("kode_cli_secret_set", { instance: instanceId, name, value });
}

export function removeSecret(instanceId: string, name: string): Promise<void> {
  return invoke<void>("kode_cli_secret_remove", { instance: instanceId, name }).catch(() => {});
}

export function secretStatus(instanceId: string, names: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("kode_cli_secret_status", { instance: instanceId, names }).catch(() =>
    names.map(() => false),
  );
}

// ---------------------------------------------------------------------------
// Status store: install / version / sign-in and account model lists per
// instance, re-checked in the background (Health check interval).
// ---------------------------------------------------------------------------

export type CliStore = {
  statuses: CliStatus[] | null;
  /** Models listed by the agent itself, per instance (Cursor, ACP). */
  accountModels: Record<string, CliModelInfo[]>;
  /** Why listing an instance's models failed, if it did. */
  modelErrors: Record<string, string>;
  checkedAt: number | null;
  checking: boolean;
};
let store: CliStore = { statuses: null, accountModels: {}, modelErrors: {}, checkedAt: null, checking: false };
const storeListeners = new Set<() => void>();
let inflight: Promise<CliStatus[]> | null = null;
let healthTimer: ReturnType<typeof setTimeout> | null = null;

function setStore(patch: Partial<CliStore>) {
  store = { ...store, ...patch };
  storeListeners.forEach((fn) => fn());
}

/** Ask an instance for its model list (Cursor: `models`; ACP: a test session). */
export async function loadInstanceModels(instance: ProviderInstance): Promise<void> {
  try {
    const models = await invoke<{ id: string; name: string }[]>("kode_cli_models", {
      provider: instance.kind,
      config: rustConfig(instance),
    });
    const { [instance.id]: _, ...errors } = store.modelErrors;
    void _;
    setStore({ accountModels: { ...store.accountModels, [instance.id]: models }, modelErrors: errors });
  } catch (error) {
    setStore({ modelErrors: { ...store.modelErrors, [instance.id]: String(error) } });
  }
}

async function loadAccountModels(statuses: CliStatus[]) {
  const jobs = getProviders()
    .filter((instance) => {
      const status = statuses.find((s) => s.instance === instance.id);
      if (!status?.installed) return false;
      if (instance.kind === "cursor") return status.loggedIn === true;
      // ACP agents start a short test session, so only for enabled ones.
      return instance.kind === "acp" && instance.enabled;
    })
    .map(loadInstanceModels);
  await Promise.all(jobs);
}

function detectClis(): Promise<CliStatus[]> {
  if (inflight) return inflight;
  setStore({ checking: true });
  inflight = invoke<CliStatus[]>("kode_cli_detect", {
    instances: getProviders().map((p) => ({ id: p.id, provider: p.kind, config: rustConfig(p) })),
  })
    .catch(() => [] as CliStatus[])
    .then(async (statuses) => {
      setStore({ statuses });
      await loadAccountModels(statuses);
      setStore({ checkedAt: Date.now(), checking: false });
      return statuses;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function scheduleHealthCheck() {
  if (healthTimer) clearTimeout(healthTimer);
  const seconds = getSettings().kodeCliHealthInterval ?? 300;
  // 0 turns background checks off; look again later in case it changes.
  healthTimer = setTimeout(
    () => {
      if (seconds > 0) void detectClis();
      scheduleHealthCheck();
    },
    Math.max(seconds, 60) * 1000,
  );
}

/** Re-check every instance (install, version, sign-in, models) now. */
export function refreshCliProviders(): Promise<CliStatus[]> {
  scheduleHealthCheck();
  return detectClis();
}

function subscribeStore(listener: () => void) {
  storeListeners.add(listener);
  if (!store.statuses && !inflight) {
    void detectClis();
    scheduleHealthCheck();
  }
  return () => storeListeners.delete(listener);
}

export function useCliStore(): CliStore {
  return useSyncExternalStore(subscribeStore, () => store, () => store);
}

export function useCliProviders(): CliStatus[] | null {
  return useCliStore().statuses;
}

// ---------------------------------------------------------------------------
// Version support per model
// ---------------------------------------------------------------------------

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Oldest CLI version that knows a model (null = any version). */
function minCliVersion(model: string, kind: ProviderKind): string | null {
  // Claude Code learned Opus/Sonnet/Haiku 5.5 and Fable 5.1 in 2.1.293.
  if (kind === "claude" && /^claude-((opus|sonnet|haiku)-5-5|fable-5-1)/.test(model)) return "2.1.293";
  return null;
}

/** "Update Claude Code to v2.1.293 or newer…" when the CLI is too old. */
export function cliVersionIssue(model: string, instance: ProviderInstance, statuses: CliStatus[] | null): string | null {
  const status = statuses?.find((s) => s.instance === instance.id);
  const min = minCliVersion(model, instance.kind);
  if (!status?.version || !min || compareVersions(status.version, min) >= 0) return null;
  return `Update ${kindName(instance)} to v${min} or newer to use this model (you have v${status.version}).`;
}

// ---------------------------------------------------------------------------
// Update / sign in / sign out (the agents' own commands)
// ---------------------------------------------------------------------------

export type CliTask = { kind: "update" } | { kind: "login" } | { kind: "logout" };

/** Start a maintenance task; streams output lines and can be cancelled. */
export function startCliTask(
  instance: ProviderInstance,
  task: CliTask,
  onLine: (line: string) => void,
): { done: Promise<CliTaskResult>; cancel: () => void } {
  let runId: number | null = null;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    if (runId !== null) void invoke("kode_cli_stop", { runId }).catch(() => {});
  };
  const done = (async () => {
    runId = await invoke<number>("kode_cli_new_run");
    if (cancelled) await invoke("kode_cli_stop", { runId }).catch(() => {});
    const channel = new Channel<string>();
    channel.onmessage = onLine;
    const config = rustConfig(instance);
    const provider = instance.kind;
    try {
      return task.kind === "update"
        ? await invoke<CliTaskResult>("kode_cli_update", { runId, provider, config, onLine: channel })
        : await invoke<CliTaskResult>("kode_cli_auth", { runId, provider, action: task.kind, config, onLine: channel });
    } finally {
      void refreshCliProviders();
    }
  })();
  return { done, cancel };
}

// ---------------------------------------------------------------------------
// Per-chat CLI session (so follow-ups continue the same agent conversation)
// ---------------------------------------------------------------------------

const SESSION_KEY = (chatId: string) => `kode.cli-session.${chatId}`;

export function getCliSession(chatId: string, instanceId: string): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY(chatId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as { provider?: string; sessionId?: string };
    return stored.provider === instanceId && stored.sessionId ? stored.sessionId : null;
  } catch {
    return null;
  }
}

export function saveCliSession(chatId: string, instanceId: string, sessionId: string) {
  try {
    localStorage.setItem(SESSION_KEY(chatId), JSON.stringify({ provider: instanceId, sessionId }));
  } catch {
    // Storage unavailable: follow-ups just start a fresh session.
  }
}

// ---------------------------------------------------------------------------
// Running a turn
// ---------------------------------------------------------------------------

export type RunCliTurnParams = {
  instance: ProviderInstance;
  root: string;
  prompt: string;
  sessionId: string | null;
  /** With `sessionId`: branch a new session from it instead of continuing it. */
  fork?: boolean;
  /** Model for the agent; null (or "default") keeps its default. */
  model: string | null;
  mode: string;
  signal?: AbortSignal;
  onEvent: (event: CliEvent) => void;
};

/**
 * Plugins and MCP servers for a CLI turn. Claude Code loads enabled plugins
 * itself (--plugin-dir, which brings their MCP servers), so it only gets the
 * servers you added; other CLIs get yours plus the plugin ones.
 */
function cliExtensions(kind: ProviderKind) {
  const plugins = getPlugins().filter((p) => p.enabled);
  const own = loadMcpConfigs().filter((c) => c.enabled);
  const servers = kind === "claude" ? own : [...own, ...pluginMcpConfigs(plugins).filter((c) => c.enabled)];
  return {
    pluginDirs: kind === "claude" ? plugins.map((p) => p.dir) : [],
    mcpServers: servers.map((c) => ({
      name: c.name,
      command: c.command ?? null,
      args: c.args ?? [],
      env: c.env ?? {},
      url: c.url ?? null,
    })),
  };
}

export async function runCliTurn({
  instance,
  root,
  prompt,
  sessionId,
  fork = false,
  model,
  mode,
  signal,
  onEvent,
}: RunCliTurnParams): Promise<CliRunResult> {
  const runId = await invoke<number>("kode_cli_new_run");
  const stop = () => void invoke("kode_cli_stop", { runId }).catch(() => {});
  if (signal?.aborted) stop();
  signal?.addEventListener("abort", stop, { once: true });

  const channel = new Channel<CliEvent>();
  channel.onmessage = onEvent;
  try {
    return await invoke<CliRunResult>("kode_cli_run", {
      runId,
      request: {
        provider: instance.kind,
        root,
        prompt,
        sessionId,
        fork: fork && !!sessionId,
        model: model && model !== DEFAULT_MODEL.id ? model : null,
        mode,
        config: rustConfig(instance),
        ...cliExtensions(instance.kind),
      },
      onEvent: channel,
    });
  } finally {
    signal?.removeEventListener("abort", stop);
  }
}

// ---------------------------------------------------------------------------
// Mapping agent tool activity onto Kode's tool step cards
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function shorten(text: string, max = 90): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function describeCliTool(name: string, input: Record<string, unknown>): string {
  const path = str(input.file_path) || str(input.path) || str(input.notebook_path);
  switch (name) {
    // Claude Code tools (Cursor's are mapped to these names in Rust)
    case "Bash":
      return `Ran ${shorten(str(input.command))}`;
    case "Read":
      return `Read ${path}`;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `Edited ${path}`;
    case "Write":
      return `Wrote ${path}`;
    case "Delete":
      return `Deleted ${path}`;
    case "LS":
      return `Listed ${path || "files"}`;
    case "Grep":
    case "Glob":
      return `Searched ${shorten(str(input.pattern) || str(input.globPattern))}`;
    case "WebFetch":
      return `Fetched ${shorten(str(input.url))}`;
    case "WebSearch":
      return `Searched the web for ${shorten(str(input.query))}`;
    case "TodoWrite":
      return "Updated the plan";
    case "Task":
    case "Agent":
      return `Ran a subagent: ${shorten(str(input.description))}`;
    // Codex items
    case "command_execution":
      return `Ran ${shorten(str(input.command))}`;
    case "file_change": {
      const changes = Array.isArray(input.changes)
        ? (input.changes as { path?: string }[]).map((c) => c.path).filter(Boolean)
        : [];
      return changes.length ? `Edited ${shorten(changes.join(", "))}` : "Edited files";
    }
    case "web_search":
      return `Searched the web for ${shorten(str(input.query))}`;
    case "mcp_tool_call":
      return `Used ${str(input.server)}.${str(input.tool)}`;
    // ACP agents send a human-readable title
    case "acp":
      return shorten(str(input.title)) || "Used a tool";
    default:
      return name;
  }
}

/** Fold one tool event into a Kode tool step (by id). */
export function cliToolStep(
  event: Extract<CliEvent, { type: "toolStart" | "toolEnd" }>,
  previous: KodeToolStep | undefined,
): KodeToolStep {
  if (event.type === "toolStart") {
    const args =
      event.input && typeof event.input === "object" ? (event.input as Record<string, unknown>) : {};
    return {
      id: event.id,
      name: event.name,
      args,
      description: describeCliTool(event.name, args),
      state: previous?.state === "done" || previous?.state === "error" ? previous.state : "running",
      result: previous?.result,
    };
  }
  return {
    id: event.id,
    name: previous?.name ?? "tool",
    args: previous?.args ?? {},
    description: previous?.description ?? "Tool",
    state: event.isError ? "error" : "done",
    result: event.output,
  };
}

const TODO_STATUSES: KodeTodoStatus[] = ["pending", "in_progress", "completed"];

export function cliTodos(items: { title: string; status: string }[]): KodeTodo[] {
  return items.map((item) => ({
    title: item.title,
    status: (TODO_STATUSES as string[]).includes(item.status) ? (item.status as KodeTodoStatus) : "pending",
  }));
}
