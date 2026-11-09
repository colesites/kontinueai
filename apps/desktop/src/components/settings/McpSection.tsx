import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Download, Loader2, Pencil, Plus, PlugZap, Trash2, X } from "lucide-react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { KodeMcpServerCard } from "./KodeMcpServerCard";
import {
  clearMcpPermissions,
  listMcpTools,
  loadMcpConfigs,
  saveMcpConfigs,
  startMcpServer,
  stopMcpServer,
  type McpServerConfig,
  type McpTool,
} from "@/lib/kode-mcp";

/** A server set up in another tool (Claude Code, Cursor, Codex, a project's .mcp.json). */
type FoundMcpServer = {
  source: string;
  name: string;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  hasHeaders: boolean;
};

const foundKey = (s: FoundMcpServer) => `${s.source}:${s.name}`;
const sameServer = (c: McpServerConfig, s: FoundMcpServer) =>
  (s.url ? c.url === s.url : c.command === s.command && (c.args ?? []).join(" ") === s.args.join(" "));

const EMPTY_DRAFT = { name: "", command: "", args: "", env: "", url: "" };

export function McpSection() {
  const { folders } = useKodeWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [found, setFound] = useState<FoundMcpServer[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [configs, setConfigs] = useState<McpServerConfig[]>(() => loadMcpConfigs());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (next: McpServerConfig[]) => {
    setConfigs(next);
    saveMcpConfigs(next);
  };

  const toggle = (id: string) => {
    persist(configs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const remove = (id: string) => {
    void stopMcpServer(id);
    persist(configs.filter((c) => c.id !== id));
  };

  const test = async (config: McpServerConfig) => {
    setBusy(config.id);
    setError(null);
    try {
      await startMcpServer(config);
      const list = await listMcpTools(config.id);
      setTools((prev) => ({ ...prev, [config.id]: list }));
      setExpanded(config.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const addServer = () => {
    const name = draft.name.trim();
    const command = draft.command.trim();
    const url = draft.url.trim();
    if (!name || (!command && !url)) {
      setError("Name, and either a command or a URL, are required.");
      return;
    }
    const args = draft.args.split("\n").map((s) => s.trim()).filter(Boolean);
    const env: Record<string, string> = {};
    for (const line of draft.env.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const fields = {
      name,
      command: command || undefined,
      args: command ? args : undefined,
      env: command ? env : undefined,
      url: url || undefined,
    };
    if (editingId) {
      // Restart with the new settings the next time it's used.
      void stopMcpServer(editingId);
      persist(configs.map((c) => (c.id === editingId ? { ...c, ...fields } : c)));
    } else {
      persist([...configs, { id: `mcp-${Date.now()}`, ...fields, enabled: true }]);
    }
    setDraft(EMPTY_DRAFT);
    setAdding(false);
    setEditingId(null);
    setError(null);
  };

  const startEdit = (config: McpServerConfig) => {
    setDraft({
      name: config.name,
      command: config.command ?? "",
      args: (config.args ?? []).join("\n"),
      env: Object.entries(config.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
      url: config.url ?? "",
    });
    setEditingId(config.id);
    setAdding(true);
    setFound(null);
    setError(null);
  };

  const scan = async () => {
    setScanning(true);
    setError(null);
    setAdding(false);
    setEditingId(null);
    try {
      const list = await invoke<FoundMcpServer[]>("kode_mcp_discover", { projectRoots: folders.map((f) => f.path) });
      setFound(list);
      setPicked(new Set(list.filter((s) => !configs.some((c) => sameServer(c, s))).map(foundKey)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const importPicked = () => {
    if (!found) return;
    const now = Date.now();
    const added: McpServerConfig[] = [];
    for (const [index, server] of found.entries()) {
      if (!picked.has(foundKey(server))) continue;
      if ([...configs, ...added].some((c) => sameServer(c, server))) continue;
      const taken = new Set([...configs, ...added].map((c) => c.name.toLowerCase()));
      const name = taken.has(server.name.toLowerCase()) ? `${server.name} (${server.source})` : server.name;
      added.push({
        id: `mcp-${now}-${index}`,
        name,
        command: server.command ?? undefined,
        args: server.command ? server.args : undefined,
        env: server.command ? server.env : undefined,
        url: server.url ?? undefined,
        enabled: true,
      });
    }
    if (added.length) persist([...configs, ...added]);
    setFound(null);
  };

  return (
    <div>
      <KodeMcpServerCard />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="px-1 text-[11.5px] text-muted-foreground">
            {configs.length} server{configs.length === 1 ? "" : "s"} · external tools exposed to Kode
          </p>
          <button
            type="button"
            onClick={() => clearMcpPermissions()}
            title="Forget saved allow/deny decisions for all MCP tools"
            className="cursor-pointer px-1 text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
          >
            Reset permissions
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => (found ? setFound(null) : void scan())}
            disabled={scanning}
            title="Bring in servers you set up in Claude Code, Claude Desktop, Cursor, Codex or a project's .mcp.json"
            className="kontinue-3d flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] text-foreground/85 hover:text-foreground disabled:opacity-60"
          >
            {scanning ? <Loader2 size={13} className="animate-spin" /> : found ? <X size={13} /> : <Download size={13} />}
            {found ? "Close" : "Import"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (adding) {
                setAdding(false);
                setEditingId(null);
                setDraft(EMPTY_DRAFT);
              } else {
                setAdding(true);
                setFound(null);
              }
            }}
            className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium"
          >
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? "Cancel" : "Add server"}
          </button>
        </div>
      </div>

      {found ? (
        <section className="mb-6">
          <div className="liquid-glass-dropdown space-y-2 !rounded-[20px] p-4">
            <p className="text-[13px] font-medium">Servers found on this Mac</p>
            {found.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">None found in Claude Code, Claude Desktop, Cursor, Codex or your projects' .mcp.json.</p>
            ) : (
              <div className="space-y-0.5">
                {found.map((server) => {
                  const key = foundKey(server);
                  const already = configs.some((c) => sameServer(c, server));
                  const on = picked.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={already}
                      onClick={() =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className="flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-black/[0.04] disabled:cursor-default disabled:opacity-55 dark:hover:bg-white/[0.05]"
                    >
                      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border", on && !already ? "border-purple-500 bg-purple-500 text-white" : "border-black/20 dark:border-white/25")}>
                        {on && !already ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-medium">{server.name}</span>
                          <span className="shrink-0 text-[10.5px] text-muted-foreground">{already ? "already added" : server.source}</span>
                        </span>
                        <span className="block truncate font-mono text-[10.5px] text-muted-foreground/80">{server.url ?? `${server.command} ${server.args.join(" ")}`}</span>
                        {server.hasHeaders ? <span className="block text-[10.5px] text-amber-600 dark:text-amber-400">Its custom headers are not carried over, so it may ask you to sign in.</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {found.some((s) => picked.has(foundKey(s)) && !configs.some((c) => sameServer(c, s))) ? (
              <button type="button" onClick={importPicked} className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-4 text-[12px] font-medium">
                Import selected
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {adding ? (
        <section className="mb-6">
          <div className="liquid-glass-dropdown !rounded-[20px] p-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="mcp-name" className="mb-1 block text-[11.5px] font-medium text-muted-foreground">Name</label>
                <input
                  id="mcp-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="GitHub"
                  className="kontinue-3d h-8 w-full rounded-full px-3.5 text-[12.5px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="mcp-command" className="mb-1 block text-[11.5px] font-medium text-muted-foreground">Command (stdio)</label>
                <input
                  id="mcp-command"
                  value={draft.command}
                  onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))}
                  placeholder="npx"
                  className="kontinue-3d h-8 w-full rounded-full px-3.5 font-mono text-[12.5px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="mcp-url" className="mb-1 block text-[11.5px] font-medium text-muted-foreground">…or URL (HTTP)</label>
                <input
                  id="mcp-url"
                  value={draft.url}
                  onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                  placeholder="https://mcp.example.com/mcp"
                  className="kontinue-3d h-8 w-full rounded-full px-3.5 font-mono text-[12.5px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="mcp-args" className="mb-1 block text-[11.5px] font-medium text-muted-foreground">Arguments (one per line)</label>
                <textarea
                  id="mcp-args"
                  value={draft.args}
                  onChange={(e) => setDraft((d) => ({ ...d, args: e.target.value }))}
                  rows={2}
                  placeholder={"-y\n@modelcontextprotocol/server-github"}
                  className="kontinue-3d w-full rounded-[16px] px-3.5 py-2.5 font-mono text-[12px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="mcp-env" className="mb-1 block text-[11.5px] font-medium text-muted-foreground">Environment (KEY=VALUE per line)</label>
                <textarea
                  id="mcp-env"
                  value={draft.env}
                  onChange={(e) => setDraft((d) => ({ ...d, env: e.target.value }))}
                  rows={2}
                  placeholder={"GITHUB_PERSONAL_ACCESS_TOKEN=ghp_…"}
                  className="kontinue-3d w-full rounded-[16px] px-3.5 py-2.5 font-mono text-[12px] outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              {error ? <p className="text-[11.5px] text-rose-400">{error}</p> : null}
              <button type="button" onClick={addServer} className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-4 text-[12px] font-medium">
                {editingId ? "Save changes" : "Add server"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {configs.length === 0 && !adding && !found ? (
        <p className="px-1 py-6 text-[12.5px] text-muted-foreground">
          No MCP servers configured. Import the ones you use in Claude Code, Cursor or Codex, or add one, e.g.{" "}
          <code className="font-mono">npx -y @modelcontextprotocol/server-filesystem</code>.
        </p>
      ) : null}

      <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
        {configs.map((config) => {
          const isOpen = expanded === config.id;
          const toolList = tools[config.id] ?? [];
          return (
            <div key={config.id} className="px-4 py-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : config.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
                >
                  <PlugZap size={13} className="mt-0.5 shrink-0 text-purple-400" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground/90">{config.name}</span>
                      <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
                        {config.url ?? `${config.command} ${(config.args ?? []).join(" ")}`}
                      </span>
                    </span>
                    {toolList.length > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{toolList.length} tool{toolList.length === 1 ? "" : "s"}</span>
                    ) : null}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void test(config)}
                    disabled={busy === config.id}
                    className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] text-foreground/85 hover:text-foreground disabled:opacity-50"
                  >
                    {busy === config.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    Test
                  </button>
                  <button type="button" onClick={() => startEdit(config)} title="Edit" aria-label={`Edit ${config.name}`} className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                    <Pencil size={12} />
                  </button>
                  <Switch checked={config.enabled} onCheckedChange={() => toggle(config.id)} />
                  <button type="button" onClick={() => remove(config.id)} title="Remove" className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-rose-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {isOpen && toolList.length > 0 ? (
                <div className="mt-2.5 space-y-0.5 border-l border-black/[0.06] pl-4 dark:border-white/[0.08]">
                  {toolList.map((tool) => (
                    <div key={tool.name} className="py-0.5">
                      <p className="font-mono text-[11.5px] text-foreground/80">{tool.name}</p>
                      {tool.description ? <p className="text-[10.5px] leading-snug text-muted-foreground">{tool.description}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
