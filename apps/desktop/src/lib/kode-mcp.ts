// MCP client for the renderer: server configs, discovery, and tool execution.
// Configs live in localStorage; the actual protocol runs in Rust (mcp.rs).

import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import type { KodeToolDefinition } from "./kode-chat";

export type McpServerConfig = {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
};

const CONFIGS_KEY = "kode.mcpServers.v1";

export function loadMcpConfigs(): McpServerConfig[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIGS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as McpServerConfig[]) : [];
  } catch {
    return [];
  }
}

export function saveMcpConfigs(configs: McpServerConfig[]): void {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  notifyMcpChanged();
}

// ---------------------------------------------------------------------------
// Change signal: Settings edits (toggle, sign-in) make Kode reload its tools.
// ---------------------------------------------------------------------------

let mcpVersion = 0;
const mcpListeners = new Set<() => void>();

export function notifyMcpChanged(): void {
  mcpVersion += 1;
  for (const listener of mcpListeners) listener();
}

export function useMcpVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      mcpListeners.add(listener);
      return () => mcpListeners.delete(listener);
    },
    () => mcpVersion,
  );
}

// ---------------------------------------------------------------------------
// OAuth for remote servers (src-tauri/src/mcp_auth.rs)
// ---------------------------------------------------------------------------

/** Error prefix from Rust meaning "sign in to this server". */
export const MCP_AUTH_REQUIRED = "MCP_AUTH_REQUIRED";

export const mcpSignedIn = (url: string) => invoke<boolean>("mcp_oauth_status", { url });

export async function mcpSignIn(url: string): Promise<void> {
  await invoke("mcp_oauth_login", { url });
  notifyMcpChanged();
}

export async function mcpSignOut(url: string): Promise<void> {
  await invoke("mcp_oauth_logout", { url });
  notifyMcpChanged();
}

/** Whether a remote server asks for sign-in (connects once, then disconnects). */
export async function mcpNeedsSignIn(config: McpServerConfig): Promise<boolean> {
  if (!config.url) return false;
  const probe = { ...config, id: `probe-${config.id}` };
  try {
    await startMcpServer(probe);
    await stopMcpServer(probe.id);
    return false;
  } catch (error) {
    return String(error).includes(MCP_AUTH_REQUIRED);
  }
}

export type McpTool = {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

const MCP_PREFIX = "mcp__";

/** Full tool name the model calls, e.g. `mcp__github__create_issue`. */
export function mcpToolName(serverId: string, toolName: string): string {
  return `${MCP_PREFIX}${serverId}__${toolName}`;
}

/** Split a `mcp__server__tool` name back into its parts. */
export function parseMcpToolName(name: string): { serverId: string; toolName: string } | null {
  if (!name.startsWith(MCP_PREFIX)) return null;
  const rest = name.slice(MCP_PREFIX.length);
  const index = rest.indexOf("__");
  if (index === -1) return null;
  return { serverId: rest.slice(0, index), toolName: rest.slice(index + 2) };
}

export async function startMcpServer(config: McpServerConfig): Promise<void> {
  await invoke("mcp_start", {
    serverId: config.id,
    command: config.command ?? null,
    args: config.args ?? [],
    env: config.env ?? {},
    url: config.url ?? null,
  });
}

export async function listMcpTools(serverId: string): Promise<McpTool[]> {
  const result = await invoke<{ tools?: unknown }>("mcp_list_tools", { serverId });
  const rows = result?.tools;
  if (!Array.isArray(rows)) return [];
  const tools: McpTool[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const tool = row as { name?: string; description?: string; inputSchema?: Record<string, unknown> };
    if (typeof tool.name !== "string" || !tool.name) continue;
    tools.push({
      serverId,
      name: tool.name,
      description: typeof tool.description === "string" ? tool.description : undefined,
      inputSchema: tool.inputSchema,
    });
  }
  return tools;
}

export type McpCallResult = { content: string; isError: boolean };

export async function callMcpTool(serverId: string, name: string, args: Record<string, unknown>): Promise<McpCallResult> {
  const result = await invoke<{ content?: unknown; isError?: boolean }>("mcp_call_tool", { serverId, name, arguments: args });
  const blocks = result?.content;
  let content = "";
  if (Array.isArray(blocks)) {
    const parts: string[] = [];
    for (const block of blocks) {
      if (block && typeof block === "object") {
        const item = block as { type?: string; text?: string };
        if (item.type === "text" && typeof item.text === "string") parts.push(item.text);
        else parts.push(JSON.stringify(block));
      }
    }
    content = parts.join("\n");
  }
  return { content: content || "(empty result)", isError: Boolean(result?.isError) };
}

export async function stopMcpServer(serverId: string): Promise<void> {
  try {
    await invoke("mcp_stop", { serverId });
  } catch {
    // ignore — it may already be stopped
  }
}

// ─── Per-tool permission memory ─────────────────────────────────────────────

const PERMISSIONS_KEY = "kode.mcpPermissions.v1";

export type McpPermission = "allow" | "deny";

export function getMcpPermission(fullToolName: string): McpPermission | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERMISSIONS_KEY) ?? "{}");
    const value = parsed?.[fullToolName];
    return value === "allow" || value === "deny" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function setMcpPermission(fullToolName: string, permission: McpPermission): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERMISSIONS_KEY) ?? "{}");
    parsed[fullToolName] = permission;
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export function clearMcpPermissions(): void {
  localStorage.removeItem(PERMISSIONS_KEY);
}

/** Start every enabled server and return their tools + the Kode tool definitions. */
export async function discoverMcpTools(configs: McpServerConfig[]): Promise<{ tools: McpTool[]; definitions: KodeToolDefinition[] }> {
  const tools: McpTool[] = [];
  for (const config of configs.filter((c) => c.enabled)) {
    try {
      await startMcpServer(config);
      tools.push(...(await listMcpTools(config.id)));
    } catch (error) {
      console.warn(`[mcp] failed to start ${config.name}: ${String(error)}`);
    }
  }
  const definitions: KodeToolDefinition[] = tools.map((tool) => ({
    type: "function",
    function: {
      name: mcpToolName(tool.serverId, tool.name),
      description: tool.description ?? `MCP tool: ${tool.name}`,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
  return { tools, definitions };
}
