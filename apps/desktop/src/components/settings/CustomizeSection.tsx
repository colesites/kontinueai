import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Loader2,
  Package,
  X,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/convex-api";
import {
  loadMcpConfigs,
  mcpNeedsSignIn,
  mcpSignIn,
  mcpSignOut,
  mcpSignedIn,
  saveMcpConfigs,
  type McpServerConfig,
} from "@/lib/kode-mcp";
import {
  discardPluginStaging,
  inspectPluginSource,
  installPlugin,
  pluginMcpConfigs,
  pluginSourceRef,
  removePlugin,
  setPluginEnabled,
  setPluginHooksAllowed,
  updatePlugin,
  setPluginServerEnabled,
  usePlugins,
  useMarketplaces,
  isKnownMarketplace,
  removeMarketplace,
  saveMarketplace,
  type InstalledPlugin,
  type SourceListing,
  type SourcePlugin,
} from "@/lib/kode-plugins";
import { cn } from "@/lib/utils";
import { McpSection } from "./McpSection";
import { SkillsSection } from "./SkillsSection";

// Settings → Customize: what Kontinue and Kode can reach (Connectors), what
// they know (Skills), and packages that bundle both (Plugins), like Claude's
// Customize page. Plugins use the Claude Code plugin format.

const WEB_APP = "https://chat.kontinueai.com";

export type CustomizeTab = "connectors" | "skills" | "plugins";

export const WEB_CONNECTORS = [
  { provider: "github", name: "GitHub", description: "Repositories, issues and pull requests" },
  { provider: "gmail", name: "Gmail", description: "Read, search and draft email" },
  { provider: "google_calendar", name: "Google Calendar", description: "Events and availability" },
  { provider: "google_drive", name: "Google Drive", description: "Docs, Sheets and files" },
  { provider: "notion", name: "Notion", description: "Pages and databases" },
  { provider: "vercel", name: "Vercel", description: "Projects and deployments" },
  { provider: "todoist", name: "Todoist", description: "Tasks and projects" },
];

const CONNECTOR_LOGO: Record<string, string> = {
  github: "https://cdn.simpleicons.org/github/white",
  gmail: "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png",
  google_calendar: "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png",
  google_drive: "https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png",
  notion: "https://cdn.simpleicons.org/notion/white",
  vercel: "https://cdn.simpleicons.org/vercel/white",
  todoist: "https://cdn.simpleicons.org/todoist",
};

const openExternal = (url: string) => void openUrl(url).catch(() => window.open(url, "_blank"));

const errorText = (error: unknown) =>
  typeof error === "string" ? error : error instanceof Error ? error.message : "Something went wrong.";

export function CustomizeSection({ initialTab = "connectors" }: { initialTab?: CustomizeTab }) {
  const [tab, setTab] = useState<CustomizeTab>(initialTab);
  return (
    <div>
      <div className="mb-5 flex gap-1">
        {(["connectors", "skills", "plugins"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-8 cursor-pointer rounded-full px-3.5 text-body capitalize transition-colors",
              tab === id ? "kontinue-menu-active font-medium" : "text-muted-foreground kontinue-hover hover:text-foreground",
            )}
          >
            {id}
          </button>
        ))}
      </div>
      {tab === "connectors" ? <ConnectorsTab onOpenPlugins={() => setTab("plugins")} /> : null}
      {tab === "skills" ? <SkillsSection /> : null}
      {tab === "plugins" ? <PluginsTab /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connectors: web apps, MCP servers you added, and ones plugins provide
// ---------------------------------------------------------------------------

function TypeLabel({ children, badge }: { children: ReactNode; badge?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-label text-muted-foreground">
      {children}
      {badge ? (
        <span className="rounded-full border border-black/10 px-1.5 text-micro dark:border-white/15">{badge}</span>
      ) : null}
    </span>
  );
}

function ConnectorRow({
  icon,
  name,
  detail,
  type,
  status,
}: {
  icon: ReactNode;
  name: string;
  detail?: string;
  type: ReactNode;
  status: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_130px_110px] items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="kontinue-3d flex size-8 shrink-0 items-center justify-center rounded-full">{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-foreground/90">{name}</p>
          {detail ? <p className="truncate text-caption text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
      <div>{type}</div>
      <div className="flex justify-end">{status}</div>
    </div>
  );
}

/**
 * Status for a server: a switch, plus sign-in for remote servers that need it
 * (OAuth in the browser; tokens stay in the keychain).
 */
function ServerStatus({
  config,
  onToggle,
}: {
  config: McpServerConfig;
  onToggle: (enabled: boolean) => void;
}) {
  const [state, setState] = useState<"checking" | "ok" | "signed-in" | "needs-sign-in">(
    config.url ? "checking" : "ok",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.url) return;
    let cancelled = false;
    void (async () => {
      const signedIn = await mcpSignedIn(config.url!).catch(() => false);
      if (signedIn) return !cancelled && setState("signed-in");
      const needs = await mcpNeedsSignIn(config).catch(() => false);
      if (!cancelled) setState(needs ? "needs-sign-in" : "ok");
    })();
    return () => {
      cancelled = true;
    };
    // Rows are rebuilt each render; only re-check when the server changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id, config.url]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await mcpSignIn(config.url!);
      setState("signed-in");
      if (!config.enabled) onToggle(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (state === "checking") return <Loader2 size={13} className="animate-spin text-muted-foreground" />;
  if (state === "needs-sign-in") {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void signIn()}
          className="kontinue-3d flex h-7 cursor-pointer items-center gap-1 rounded-full px-3 text-label disabled:opacity-60"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : null}
          {busy ? "Waiting…" : "Sign in"}
        </button>
        {error ? <span className="max-w-40 text-right text-micro text-rose-400">{error}</span> : null}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {state === "signed-in" ? (
        <button
          type="button"
          onClick={() => void mcpSignOut(config.url!).then(() => setState("needs-sign-in"))}
          className="cursor-pointer text-caption text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      ) : null}
      <Switch checked={config.enabled} onCheckedChange={onToggle} />
    </span>
  );
}

function ConnectorsTab({ onOpenPlugins }: { onOpenPlugins: () => void }) {
  const connectors = useQuery(api.connectors.listConnectors, {});
  const connected = new Set((connectors ?? []).filter((c) => c.connected).map((c) => c.provider));
  const disconnect = useMutation(api.connectors.disconnect);
  const plugins = usePlugins();
  const [userServers, setUserServers] = useState<McpServerConfig[]>(() => loadMcpConfigs());
  const [manageMcp, setManageMcp] = useState(false);
  const pluginServers = pluginMcpConfigs(plugins);

  const toggleUserServer = (id: string, enabled: boolean) => {
    const next = loadMcpConfigs().map((c) => (c.id === id ? { ...c, enabled } : c));
    saveMcpConfigs(next);
    setUserServers(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-label text-muted-foreground">
          Apps and servers Kontinue and Kode can read from and act on.
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-label font-medium"
            >
              <Plus size={13} /> Add <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-56 p-1.5">
            <DropdownMenuItem onClick={() => openExternal(`${WEB_APP}/settings/connectors`)} className="gap-2 px-3 py-1.5 text-body">
              <ExternalLink size={13} /> Connect an app
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setManageMcp(true)} className="gap-2 px-3 py-1.5 text-body">
              <PlugZap size={13} /> Custom MCP server
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenPlugins} className="gap-2 px-3 py-1.5 text-body">
              <Package size={13} /> From a plugin
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="liquid-glass-dropdown mb-6 divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
        <div className="grid grid-cols-[minmax(0,1fr)_130px_110px] gap-3 px-4 py-2 text-caption text-muted-foreground">
          <span>Connector</span>
          <span>Type</span>
          <span className="text-right">Status</span>
        </div>

        {WEB_CONNECTORS.map((conn) => (
          <ConnectorRow
            key={conn.provider}
            icon={
              <img
                src={CONNECTOR_LOGO[conn.provider]}
                alt=""
                className="size-4 object-contain [:root:not(.dark)_&]:invert-[.85]"
              />
            }
            name={conn.name}
            detail={conn.description}
            type={<TypeLabel>Web</TypeLabel>}
            status={
              connectors === undefined ? null : connected.has(conn.provider) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-label text-emerald-500 kontinue-hover"
                    >
                      <Check size={13} /> Connected <ChevronDown size={11} className="text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6} className="w-48 p-1.5">
                    <DropdownMenuItem
                      onClick={() => void disconnect({ provider: conn.provider })}
                      className="px-3 py-1.5 text-label text-rose-400"
                    >
                      Disconnect {conn.name}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={() => openExternal(`${WEB_APP}/api/connectors/${conn.provider}/start`)}
                  className="kontinue-3d h-7 cursor-pointer rounded-full px-3 text-label"
                >
                  Connect
                </button>
              )
            }
          />
        ))}

        {userServers.map((server) => (
          <ConnectorRow
            key={server.id}
            icon={<PlugZap size={14} className="text-muted-foreground" />}
            name={server.name}
            detail={server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")}
            type={<TypeLabel>{server.url ? "Remote" : "Desktop"}</TypeLabel>}
            status={<ServerStatus config={server} onToggle={(on) => toggleUserServer(server.id, on)} />}
          />
        ))}

        {pluginServers.map((server) => (
          <ConnectorRow
            key={server.id}
            icon={<Package size={14} className="text-muted-foreground" />}
            name={server.name}
            detail={`Provided by the ${server.plugin} plugin`}
            type={<TypeLabel badge="Plugin">{server.url ? "Remote" : "Desktop"}</TypeLabel>}
            status={<ServerStatus config={server} onToggle={(on) => setPluginServerEnabled(server.id, on)} />}
          />
        ))}
      </div>

      <p className="mb-3 px-1 text-caption leading-relaxed text-muted-foreground">
        Web apps are signed in on chat.kontinueai.com and work in the Kontinue chat and Kode. Desktop and remote
        servers run from this Mac and give Kode extra tools.
      </p>

      <button
        type="button"
        onClick={() => setManageMcp((v) => !v)}
        className="mb-3 flex cursor-pointer items-center gap-1.5 px-1 text-label font-medium text-purple-500 hover:underline"
      >
        <ChevronDown size={13} className={cn("transition-transform", !manageMcp && "-rotate-90")} />
        Add or edit MCP servers
      </button>
      {manageMcp ? (
        <div onBlur={() => setUserServers(loadMcpConfigs())}>
          <McpSection />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

function pluginSummary(plugin: InstalledPlugin): string {
  const parts: string[] = [];
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (plugin.commands.length) parts.push(count(plugin.commands.length, "command"));
  if (plugin.skills.length) parts.push(count(plugin.skills.length, "skill"));
  const servers = Object.keys(plugin.mcpServers ?? {}).length;
  if (servers) parts.push(count(servers, "connector"));
  if (plugin.agents.length) parts.push(count(plugin.agents.length, "agent"));
  const hooks = hookCommands(plugin).length;
  if (hooks) parts.push(count(hooks, "hook"));
  return parts.join(" · ") || "Nothing Kode can use yet";
}

/** Every hook command a plugin would run, with its event. */
function hookCommands(plugin: InstalledPlugin): { event: string; command: string }[] {
  return Object.entries(plugin.hooks ?? {}).flatMap(([event, groups]) =>
    groups.flatMap((group) =>
      (group.hooks ?? []).filter((h) => h.command).map((h) => ({ event, command: h.command as string })),
    ),
  );
}

function PluginsTab() {
  const plugins = usePlugins();
  const marketplaces = useMarketplaces();
  const [source, setSource] = useState("");
  /** Source being opened, for its spinner. */
  const [opening, setOpening] = useState<string | null>(null);
  const [listing, setListing] = useState<{ listing: SourceListing; source: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const closeListing = () => {
    if (listing) void discardPluginStaging(listing.listing.stagingDir);
    setListing(null);
    setFilter("");
  };

  const look = async (from: string) => {
    const value = from.trim();
    if (!value) return;
    setBusy("inspect");
    setOpening(value);
    setError(null);
    closeListing();
    try {
      const found = await inspectPluginSource(value);
      if (found.plugins.length === 1 && !found.marketplace && found.plugins[0].relPath !== null) {
        await installPlugin(found, found.plugins[0], value);
        await discardPluginStaging(found.stagingDir);
        setSource("");
      } else {
        setListing({ listing: found, source: value });
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
      setOpening(null);
    }
  };

  const installFromListing = async (plugin: SourcePlugin) => {
    if (!listing) return;
    setBusy(plugin.name);
    setError(null);
    try {
      if (plugin.relPath !== null) {
        await installPlugin(
          listing.listing,
          plugin,
          listing.listing.marketplace ? pluginSourceRef(listing.source, { plugin: plugin.name }) : listing.source,
        );
      } else if (plugin.remote) {
        // The marketplace points at another repo (optionally a folder in it).
        const remote = await inspectPluginSource(plugin.remote, plugin.remotePath);
        const target = remote.plugins.find((p) => p.relPath !== null);
        if (!target) throw new Error("That plugin's repository has no plugin in it.");
        await installPlugin(remote, target, pluginSourceRef(plugin.remote, { path: plugin.remotePath }));
        await discardPluginStaging(remote.stagingDir);
      }
    } catch (err) {
      setError(`${plugin.name}: ${errorText(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const installedNames = new Set(plugins.map((p) => p.name));
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = listing?.listing.plugins ?? [];
    return q ? list.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q)) : list;
  }, [listing, filter]);

  return (
    <div>
      <p className="mb-3 px-1 text-label leading-relaxed text-muted-foreground">
        Plugins bundle commands, skills and connectors. They use the Claude Code plugin format, so plugins made for
        Claude Code install here as they are.
      </p>

      <form
        className="mb-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void look(source);
        }}
      >
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="GitHub owner/repo, git URL or folder"
          spellCheck={false}
          className="kontinue-3d h-9 min-w-0 flex-1 rounded-full px-4 text-body outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          title="Choose a folder"
          aria-label="Choose a folder"
          onClick={async () => {
            const picked = await openDialog({ directory: true, multiple: false, title: "Plugin folder" });
            if (typeof picked === "string") {
              setSource(picked);
              void look(picked);
            }
          }}
          className="kontinue-3d flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground"
        >
          <FolderOpen size={14} />
        </button>
        <button
          type="submit"
          disabled={!source.trim() || busy !== null}
          className="kontinue-3d-primary flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-body font-medium disabled:opacity-50"
        >
          {busy === "inspect" ? <Loader2 size={13} className="animate-spin" /> : null}
          Install
        </button>
      </form>
      <div className="mt-4 mb-5">
        <p className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">Marketplaces</p>
        <div className="flex flex-wrap gap-1.5">
          {marketplaces.map((market) => {
            const loading = opening !== null && opening.toLowerCase() === market.source.toLowerCase();
            const open = listing?.source.toLowerCase() === market.source.toLowerCase();
            return (
              <span key={market.source} className="group/market relative">
                <button
                  type="button"
                  title={market.source}
                  disabled={busy !== null}
                  onClick={() => void look(market.source)}
                  className={cn(
                    "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label disabled:cursor-default",
                    open ? "kontinue-capsule text-foreground" : "kontinue-3d text-foreground/80 hover:text-foreground",
                    busy !== null && !loading && "opacity-50",
                    !market.builtIn && "pr-7",
                  )}
                >
                  {loading ? <Loader2 size={11} className="animate-spin" /> : <Package size={11} className="text-purple-400" />}
                  {market.label}
                </button>
                {!market.builtIn ? (
                  <button
                    type="button"
                    title="Remove from the list"
                    onClick={() => removeMarketplace(market.source)}
                    className="kontinue-hover absolute top-1/2 right-1 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X size={10} />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
      {error ? <p className="mb-4 px-1 text-label text-rose-400">{error}</p> : null}

      {listing ? (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-label font-medium text-muted-foreground">
              {listing.listing.marketplace ?? listing.source} · {listing.listing.plugins.length} plugins
            </h2>
            <span className="flex items-center gap-3">
              {listing.listing.marketplace && !isKnownMarketplace(listing.source) ? (
                <button
                  type="button"
                  onClick={() => saveMarketplace(listing.source, listing.listing.marketplace ?? listing.source)}
                  className="cursor-pointer text-label font-medium text-purple-500 hover:underline"
                >
                  Save marketplace
                </button>
              ) : null}
              <button type="button" onClick={closeListing} className="cursor-pointer text-label text-muted-foreground hover:text-foreground">
                Close
              </button>
            </span>
          </div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Search size={13} className="text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search plugins"
              className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="liquid-glass-dropdown max-h-96 divide-y divide-black/[0.05] overflow-y-auto !rounded-[20px] dark:divide-white/[0.05]">
            {shown.map((plugin) => (
              <div key={plugin.name} className="flex items-center gap-3 px-4 py-2.5">
                <Package size={14} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{plugin.name}</p>
                  {plugin.description ? (
                    <p className="line-clamp-2 text-caption text-muted-foreground">{plugin.description}</p>
                  ) : null}
                </div>
                {installedNames.has(plugin.name) ? (
                  <span className="flex items-center gap-1 text-label text-emerald-500">
                    <Check size={12} /> Installed
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void installFromListing(plugin)}
                    className="kontinue-3d flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-label disabled:opacity-50"
                  >
                    {busy === plugin.name ? <Loader2 size={11} className="animate-spin" /> : null}
                    Install
                  </button>
                )}
              </div>
            ))}
            {shown.length === 0 ? <p className="px-4 py-3 text-label text-muted-foreground">No plugins match.</p> : null}
          </div>
        </section>
      ) : null}

      <h2 className="mb-2 px-1 text-label font-medium text-muted-foreground">Installed</h2>
      {plugins.length === 0 ? (
        <p className="px-1 text-label text-muted-foreground">No plugins yet.</p>
      ) : (
        <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
          {plugins.map((plugin) => (
            <PluginCard key={plugin.name} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}

function PluginCard({ plugin }: { plugin: InstalledPlugin }) {
  const [busy, setBusy] = useState<"update" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHooks, setShowHooks] = useState(false);
  const [hookBusy, setHookBusy] = useState(false);
  const [hookStatus, setHookStatus] = useState<string | null>(null);
  const hooks = hookCommands(plugin);

  const toggleHooks = async (on: boolean) => {
    setHookBusy(true);
    setHookStatus(on ? "Installing what the hooks need…" : null);
    setError(null);
    try {
      setHookStatus(await setPluginHooksAllowed(plugin.name, on));
    } catch (err) {
      setHookStatus(null);
      setError(errorText(err));
    } finally {
      setHookBusy(false);
    }
  };

  const update = async () => {
    setBusy("update");
    setError(null);
    try {
      await updatePlugin(plugin);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="kontinue-3d flex size-8 shrink-0 items-center justify-center rounded-full">
          <Package size={14} className="text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium">
            {plugin.name}
            {plugin.version ? <span className="ml-1.5 text-caption font-normal text-muted-foreground">v{plugin.version}</span> : null}
          </p>
          {plugin.description ? <p className="text-label text-muted-foreground">{plugin.description}</p> : null}
          <p className="mt-1 text-caption text-foreground/70">{pluginSummary(plugin)}</p>
          {plugin.agents.length ? (
            <p className="mt-0.5 truncate text-caption text-muted-foreground">
              Agents Kode can hand work to: {plugin.agents.map((a) => a.name).join(", ")}
            </p>
          ) : null}
          {error ? <p className="mt-1 text-caption text-rose-400">{error}</p> : null}
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void update()}
          className="kontinue-3d flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-caption disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Update
        </button>
        <Switch checked={plugin.enabled} onCheckedChange={(on) => void setPluginEnabled(plugin.name, on)} />
        <button
          type="button"
          aria-label={`Remove ${plugin.name}`}
          onClick={() => void removePlugin(plugin.name)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-rose-400"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {hooks.length > 0 ? (
        <div className="mt-2.5 ml-11 rounded-[14px] bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-label font-medium">Allow hooks</p>
              <p className="text-caption text-muted-foreground">
                Hooks run commands on this Mac while Kode works. Only allow plugins you trust.
              </p>
            </div>
            {hookBusy ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : null}
            <Switch
              checked={plugin.hooksAllowed}
              disabled={!plugin.enabled || hookBusy}
              onCheckedChange={(on) => void toggleHooks(on)}
            />
          </div>
          {hookStatus ? <p className="mt-1 text-caption text-muted-foreground">{hookStatus}</p> : null}
          <button
            type="button"
            onClick={() => setShowHooks((v) => !v)}
            className="mt-1.5 flex cursor-pointer items-center gap-1 text-caption text-purple-500 hover:underline"
          >
            <ChevronDown size={11} className={cn("transition-transform", !showHooks && "-rotate-90")} />
            {showHooks ? "Hide" : "Show"} the {hooks.length} command{hooks.length === 1 ? "" : "s"}
          </button>
          {showHooks ? (
            <ul className="mt-1.5 space-y-1">
              {hooks.map((hook, i) => (
                <li key={i} className="font-mono text-caption break-all text-muted-foreground">
                  <span className="text-foreground/70">{hook.event}</span> · {hook.command}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
