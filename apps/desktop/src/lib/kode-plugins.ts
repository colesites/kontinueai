// Installed plugins (Claude Code format; Rust side: src-tauri/src/plugins.rs).
// Enabled plugins add slash commands, skills (via skill discovery in Rust)
// and MCP servers, which show as "Provided by the … plugin" connectors.

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { notifyMcpChanged, type McpServerConfig } from "./kode-mcp";

export type PluginCommand = {
  name: string;
  description: string;
  argumentHint: string | null;
  body: string;
};

export type InstalledPlugin = {
  name: string;
  description: string;
  version: string | null;
  author: string | null;
  source: string;
  enabled: boolean;
  installedAt: number;
  dir: string;
  commands: PluginCommand[];
  skills: string[];
  /** `mcpServers` from the plugin, keyed by server name. */
  mcpServers: Record<string, PluginMcpServer>;
  agents: PluginAgent[];
  /** Claude Code hooks by event (null when the plugin has none). */
  hooks: Record<string, PluginHookGroup[]> | null;
  /** Hooks run commands on this Mac, so they're off until you allow them. */
  hooksAllowed: boolean;
};

export type PluginAgent = { name: string; description: string; prompt: string };

export type PluginHookGroup = {
  matcher?: string;
  hooks: { type: string; command?: string; timeout?: number }[];
};

type PluginMcpServer = {
  type?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export type SourcePlugin = {
  name: string;
  description: string;
  version: string | null;
  relPath: string | null;
  remote: string | null;
  remotePath: string | null;
};

export type SourceListing = {
  stagingDir: string;
  marketplace: string | null;
  plugins: SourcePlugin[];
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const EMPTY: InstalledPlugin[] = [];
let plugins: InstalledPlugin[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function emit(next: InstalledPlugin[]) {
  plugins = next.length ? next : EMPTY;
  for (const listener of listeners) listener();
}

export async function refreshPlugins(): Promise<InstalledPlugin[]> {
  try {
    emit(await invoke<InstalledPlugin[]>("plugin_list"));
  } catch {
    emit([]);
  }
  loaded = true;
  return plugins;
}

export function usePlugins(): InstalledPlugin[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (!loaded) void refreshPlugins();
      return () => listeners.delete(listener);
    },
    () => plugins,
  );
}

export function getPlugins(): InstalledPlugin[] {
  return plugins;
}

export const inspectPluginSource = (source: string, subdir?: string | null) =>
  invoke<SourceListing>("plugin_inspect_source", { source, subdir: subdir ?? null });

export const discardPluginStaging = (stagingDir: string) =>
  invoke<void>("plugin_discard_staging", { stagingDir }).catch(() => {});

export async function installPlugin(listing: SourceListing, plugin: SourcePlugin, source: string) {
  await invoke("plugin_install", {
    stagingDir: listing.stagingDir,
    relPath: plugin.relPath ?? "",
    source,
  });
  await refreshPlugins();
}

export async function setPluginEnabled(name: string, enabled: boolean) {
  await invoke("plugin_set_enabled", { name, enabled });
  await refreshPlugins();
}

/**
 * Allow or stop a plugin's hooks. Allowing installs its npm dependencies
 * first (hook scripts often need them); returns what happened.
 */
export async function setPluginHooksAllowed(name: string, allowed: boolean): Promise<string | null> {
  let status: string | null = null;
  if (allowed) status = await installPluginDeps(name);
  await invoke("plugin_set_hooks_allowed", { name, allowed });
  await refreshPlugins();
  return status;
}

/** Install a plugin's dependencies (production, no install scripts). */
export const installPluginDeps = (name: string) => invoke<string>("plugin_install_deps", { name });

/**
 * Where an install came from, so Update can fetch it again:
 *   "owner/repo"                 the source is the plugin
 *   "owner/repo#plugin=name"     a plugin listed in that marketplace
 *   "owner/repo#path=sub/dir"    a folder inside that repo
 */
export function pluginSourceRef(source: string, part?: { plugin?: string; path?: string | null }): string {
  if (part?.path) return `${source}#path=${part.path}`;
  if (part?.plugin) return `${source}#plugin=${part.plugin}`;
  return source;
}

/** Fetch a plugin again from its source and reinstall it (keeps it enabled). */
export async function updatePlugin(plugin: InstalledPlugin): Promise<void> {
  const [base, hash = ""] = plugin.source.split("#");
  const path = hash.startsWith("path=") ? hash.slice(5) : null;
  const named = hash.startsWith("plugin=") ? hash.slice(7) : null;
  const listing = await inspectPluginSource(base, path);
  try {
    const target =
      listing.plugins.find((p) => p.relPath !== null && (named ? p.name === named : true)) ??
      listing.plugins.find((p) => p.name === plugin.name);
    if (!target) throw new Error("The source no longer has this plugin.");
    if (target.relPath === null && target.remote) {
      const remote = await inspectPluginSource(target.remote, target.remotePath);
      try {
        const inner = remote.plugins.find((p) => p.relPath !== null);
        if (!inner) throw new Error("The source no longer has this plugin.");
        await installPlugin(remote, inner, plugin.source);
      } finally {
        await discardPluginStaging(remote.stagingDir);
      }
    } else {
      await installPlugin(listing, target, plugin.source);
    }
  } finally {
    await discardPluginStaging(listing.stagingDir);
  }
  // Reinstalling resets the flags; put back what the user had.
  if (!plugin.enabled) await setPluginEnabled(plugin.name, false);
  if (plugin.hooksAllowed) await setPluginHooksAllowed(plugin.name, true);
}

// ---------------------------------------------------------------------------
// Your own commands (~/.claude/commands, <project>/.claude/commands)
// ---------------------------------------------------------------------------

export type UserCommand = PluginCommand & { scope: "user" | "project" };

let userCommands: UserCommand[] = [];

export async function loadUserCommands(projectRoot: string | null): Promise<UserCommand[]> {
  try {
    const found = await invoke<{ user: PluginCommand[]; project: PluginCommand[] }>("kode_list_user_commands", {
      projectRoot,
    });
    userCommands = [
      ...found.project.map((c) => ({ ...c, scope: "project" as const })),
      ...found.user.map((c) => ({ ...c, scope: "user" as const })),
    ];
  } catch {
    userCommands = [];
  }
  return userCommands;
}

/** Last loaded user/project commands (used when a message is sent). */
export function getUserCommands(): UserCommand[] {
  return userCommands;
}

export async function removePlugin(name: string) {
  await invoke("plugin_remove", { name });
  await refreshPlugins();
}

// ---------------------------------------------------------------------------
// What enabled plugins contribute
// ---------------------------------------------------------------------------

export type PluginSlashCommand = PluginCommand & { plugin: string };

export function pluginCommands(list: InstalledPlugin[] = plugins): PluginSlashCommand[] {
  return list
    .filter((p) => p.enabled)
    .flatMap((p) => p.commands.map((command) => ({ ...command, plugin: p.name })));
}

/** A plugin command's prompt with the user's text in place of $ARGUMENTS. */
export function renderPluginCommand(command: PluginCommand, args: string): string {
  const body = command.body.trim();
  const rest = args.trim();
  if (/\$ARGUMENTS\b/.test(body)) return body.replace(/\$ARGUMENTS\b/g, rest);
  return rest ? `${body}\n\n${rest}` : body;
}

const DISABLED_SERVERS_KEY = "kode.plugin-mcp-disabled";

function disabledServers(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISABLED_SERVERS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Turn one plugin MCP server off (or back on) without disabling the plugin. */
export function setPluginServerEnabled(id: string, enabled: boolean) {
  const next = new Set(disabledServers());
  if (enabled) next.delete(id);
  else next.add(id);
  localStorage.setItem(DISABLED_SERVERS_KEY, JSON.stringify([...next]));
  emit([...plugins]);
  notifyMcpChanged();
}

export type PluginMcpConfig = McpServerConfig & { plugin: string };

/** MCP servers from enabled plugins, in the same shape as user-added ones. */
export function pluginMcpConfigs(list: InstalledPlugin[] = plugins): PluginMcpConfig[] {
  const off = new Set(disabledServers());
  return list
    .filter((p) => p.enabled)
    .flatMap((p) =>
      Object.entries(p.mcpServers ?? {}).map(([name, server]) => {
        const id = `plugin-${p.name}-${name}`.replace(/[^a-zA-Z0-9_-]/g, "-");
        return {
          id,
          name,
          plugin: p.name,
          url: server.url,
          command: server.command,
          args: server.args,
          env: server.env,
          enabled: !off.has(id),
        };
      }),
    );
}
