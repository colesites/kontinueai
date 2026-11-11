// Settings → Storage: the git worktrees Kode created (new-worktree threads and
// sub-agents, under ~/.kontinue/worktrees), disk used by ~/.kontinue, and
// cleanup for state this app keeps on this Mac.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { ChevronRight, FolderOpen, GitBranch, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { clearFinishedPrWatches, usePrWatches } from "@/lib/kode-pr-watch";
import { getSettings, updateSettings, useAppSettings } from "@/lib/app-settings";
import { cleanupEnabled, listWorktrees, runCleanup, useCleanupDeps, useLastCleanup, type Worktree } from "@/lib/kode-cleanup";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Card, Empty, formatBytes, staleBuildMessage, LinkButton, PillButton, Row, Select, Tag, TextField } from "./settings-ui";

type StorageEntry = { id: string; path: string; bytes: number };

const STORAGE_LABEL: Record<string, { label: string; description: string }> = {
  worktrees: { label: "Worktrees", description: "Checkouts for new-worktree threads and sub-agents." },
  plugins: { label: "Plugins", description: "Installed Kode plugins." },
  skills: { label: "Skills", description: "Your own skills." },
  commands: { label: "Commands", description: "Your own slash commands." },
  kode: { label: "Kode data", description: "Hook events and other Kode state." },
  "acp-agents": { label: "Agent downloads", description: "Agents Kontinue installed from the ACP Registry, like Antigravity." },
};

type AgentFolder = { path: string; bytes: number; children: StorageEntry[] };
type AgentStorage = { id: string; name: string; bytes: number; folders: AgentFolder[] };

/** Agents measured by settings_agent_storage (AGENT_FOLDERS in settings_info.rs). */
const AGENT_IDS = ["claude", "codex", "cursor", "gemini", "opencode", "copilot", "qwen"];

// One color per agent in the usage bar.
const AGENT_COLORS = ["#a855f7", "#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

const homePath = (path: string) => path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");

const location = () => getSettings().worktreeLocation.trim() || null;
/** Provider accounts' own config folders (CLAUDE_CONFIG_DIR / CODEX_HOME). */
const customAgentFolders = () =>
  getSettings()
    .kodeProviders.filter((p) => (p.kind === "claude" || p.kind === "codex") && p.config.homeDir.trim())
    .map((p) => ({ agent: p.kind, path: p.config.homeDir.trim() }));

const reveal = (path: string) =>
  void invoke("settings_reveal", {
    path,
    location: location(),
    extraRoots: customAgentFolders().map((f) => f.path),
  }).catch(() => {});

function ago(seconds: number): string {
  if (!seconds) return "";
  const days = Math.floor((Date.now() / 1000 - seconds) / 86_400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function StorageSection() {
  const [worktrees, setWorktreesState] = useState<Worktree[] | null>(lastWorktrees);
  const setWorktrees = (next: Worktree[]) => {
    lastWorktrees = next;
    setWorktreesState(next);
  };
  /** Bumped to re-measure disk usage (after a reload or a removed worktree). */
  const [diskVersion, setDiskVersion] = useState(0);
  const { worktreeLocation } = useAppSettings();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDiskVersion((v) => v + 1);
    try {
      setWorktrees(await listWorktrees());
    } catch (cause) {
      setError(staleBuildMessage(cause));
      setWorktrees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the worktree location changes.
  useEffect(() => {
    void load();
  }, [load, worktreeLocation]);

  const remove = async (tree: Worktree) => {
    const dirty = tree.changes > 0;
    const ok = await ask(
      dirty
        ? `${tree.branch} has ${tree.changes} uncommitted change${tree.changes === 1 ? "" : "s"}. Removing the worktree deletes them. The branch and its commits are kept.`
        : `Remove the worktree for ${tree.branch}? The branch and its commits are kept.`,
      { title: "Remove worktree", kind: "warning", okLabel: dirty ? "Delete changes and remove" : "Remove" },
    ).catch(() => false);
    if (!ok) return;
    setBusy(tree.path);
    setError(null);
    try {
      await invoke("settings_remove_worktree", { path: tree.path, force: dirty, location: location() });
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
    }
  };

  const total = useMemo(() => (worktrees ?? []).reduce((sum, t) => sum + t.bytes, 0), [worktrees]);

  return (
    <>
      <CleanupRules onRan={() => void load()} />

      <Card
        title={`Worktrees on this Mac${worktrees?.length ? ` (${worktrees.length} · ${formatBytes(total)})` : ""}`}
        action={
          <LinkButton onClick={() => void load()} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
            Refresh
          </LinkButton>
        }
      >
        {worktrees === null ? (
          <div className="flex items-center gap-2 px-5 py-4 text-label text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            Measuring…
          </div>
        ) : worktrees.length === 0 ? (
          <Empty title="No worktrees">Threads started in a new worktree, and sub-agents, get their own checkout here.</Empty>
        ) : (
          worktrees.map((tree) => (
            <div key={tree.path} className="flex items-center gap-4 px-5 py-3">
              <GitBranch size={14} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-body font-medium text-foreground/90">
                  <span className="truncate">
                    {tree.repo} <span className="font-mono text-label font-normal text-muted-foreground">{tree.branch}</span>
                  </span>
                  {tree.changes ? <Tag tone="amber">{tree.changes} uncommitted</Tag> : null}
                </p>
                <p className="mt-0.5 truncate text-caption text-muted-foreground">
                  {formatBytes(tree.bytes)} · changed {ago(tree.modified)} · <span className="font-mono">{tree.path.replace(/^\/Users\/[^/]+/, "~")}</span>
                </p>
              </div>
              <PillButton onClick={() => reveal(tree.path)} title="Show in Finder">
                <FolderOpen size={12} />
              </PillButton>
              <PillButton tone="danger" onClick={() => void remove(tree)} disabled={busy === tree.path} title="Remove worktree">
                {busy === tree.path ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </PillButton>
            </div>
          ))
        )}
      </Card>
      {error ? <p className="-mt-5 mb-6 px-1 text-label text-rose-500">{error}</p> : null}

      <DiskUsageCard version={diskVersion} />

      <AppStateCard />
    </>
  );
}

// Disk used by Kontinue (~/.kontinue and the worktree location) and by the
// coding agents in their own folders (sessions, caches, installed versions).
// Agents are read only: deleting inside another app's folder could break its history.
// Last measurement, kept for the session so coming back shows it at once.
let lastUsage: StorageEntry[] | null = null;
let lastAgents: AgentStorage[] | null = null;
let lastWorktrees: Worktree[] | null = null;

function DiskUsageCard({ version }: { version: number }) {
  const [usage, setUsageState] = useState<StorageEntry[] | null>(lastUsage);
  const [agents, setAgentsState] = useState<AgentStorage[] | null>(lastAgents);
  const setUsage = (next: StorageEntry[]) => {
    lastUsage = next;
    setUsageState(next);
  };
  const setAgents = (next: AgentStorage[]) => {
    lastAgents = next;
    setAgentsState(next);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Kontinue's own folders are quick; the agents' can take a few seconds.
    const own = invoke<StorageEntry[]>("settings_storage_usage", { location: location() })
      .then(setUsage)
      .catch((cause: unknown) => {
        setError(staleBuildMessage(cause));
        setUsage([]);
      });
    // One request per agent, so each shows as soon as its folders are measured
    // (a big ~/.gemini can take several seconds on its own).
    const extra = customAgentFolders();
    const found = new Map<string, AgentStorage>();
    let pending = AGENT_IDS.length;
    const theirs = AGENT_IDS.map((only) =>
      invoke<AgentStorage[]>("settings_agent_storage", { extra, only })
        .then((list) => {
          for (const agent of list) found.set(agent.id, agent);
        })
        .catch((cause: unknown) => setError(staleBuildMessage(cause)))
        .finally(() => {
          pending -= 1;
          // Keep the previous result until the first agent arrives, then fill in.
          if (found.size > 0 || pending === 0) {
            const merged = new Map((lastAgents ?? []).map((a) => [a.id, a]));
            for (const [id, agent] of found) merged.set(id, agent);
            // Drop agents that are gone once everything is measured.
            const list = [...merged.values()].filter((a) => pending > 0 || found.has(a.id));
            setAgents(list.sort((a, b) => b.bytes - a.bytes));
          }
        }),
    );
    await Promise.all([own, ...theirs]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  const kontinueBytes = usage?.reduce((sum, e) => sum + e.bytes, 0) ?? 0;
  // Kontinue first, then the agents (largest first, as measured).
  const segments = [
    ...(usage ? [{ id: "kontinue", name: "Kontinue", bytes: kontinueBytes }] : []),
    ...(agents ?? []).map((a) => ({ id: a.id, name: a.name, bytes: a.bytes })),
  ];
  const total = segments.reduce((sum, s) => sum + s.bytes, 0);
  // Fixed color per agent, so colors don't move while results arrive.
  const colorOf = (id: string) => AGENT_COLORS[(["kontinue", ...AGENT_IDS].indexOf(id) + AGENT_COLORS.length) % AGENT_COLORS.length];

  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));

  return (
    <Card
      title={`Disk usage on this Mac${agents && usage ? ` · ${formatBytes(total)}` : ""}`}
      action={
        <LinkButton onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </LinkButton>
      }
    >
      <div className="space-y-3 px-5 py-4">
        <p className="text-label leading-relaxed text-muted-foreground">
          Kontinue's own data, plus the sessions, caches and installed versions each coding agent keeps in its own
          folders. Agent folders are shown for reference; manage or clear them from each agent.
        </p>
        <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
          {segments.map((segment) =>
            segment.bytes > 0 ? (
              <span
                key={segment.id}
                title={`${segment.name} · ${formatBytes(segment.bytes)}`}
                style={{ width: `${(segment.bytes / Math.max(total, 1)) * 100}%`, backgroundColor: colorOf(segment.id) }}
                className="h-full min-w-[3px] border-r border-[var(--background)] transition-[width] duration-300 last:border-r-0"
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((segment) => (
            <span key={segment.id} className="flex items-center gap-1.5 text-label text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: colorOf(segment.id) }} />
              {segment.name}
              <span className="font-mono text-caption">{formatBytes(segment.bytes)}</span>
            </span>
          ))}
          {agents === null ? (
            <span className="flex items-center gap-1.5 text-label text-muted-foreground">
              <Loader2 size={11} className="animate-spin" /> Measuring the agents' folders…
            </span>
          ) : null}
        </div>
        {error ? <p className="text-label text-rose-500">{error}</p> : null}
      </div>

      {usage ? (
        <UsageRow
          name="Kontinue"
          detail={["~/.kontinue", ...(location() ? [location() as string] : [])].join(", ")}
          bytes={kontinueBytes}
          color={colorOf("kontinue")}
          expanded={open === "kontinue"}
          onToggle={() => toggle("kontinue")}
        >
          {usage.map((entry) => {
            const meta = STORAGE_LABEL[entry.id] ?? { label: entry.id, description: "" };
            return (
              <div key={entry.id} className="flex items-center gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-foreground/85">{meta.label}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {entry.id === "worktrees" ? homePath(entry.path) : meta.description}
                  </p>
                </div>
                <SizeBar bytes={entry.bytes} of={kontinueBytes} color={colorOf("kontinue")} />
                <RevealButton path={entry.path} disabled={entry.bytes === 0} />
              </div>
            );
          })}
        </UsageRow>
      ) : null}

      {(agents ?? []).map((agent) => (
        <UsageRow
          key={agent.id}
          name={agent.name}
          detail={agent.folders.map((f) => homePath(f.path)).join(", ")}
          bytes={agent.bytes}
          color={colorOf(agent.id)}
          expanded={open === agent.id}
          onToggle={() => toggle(agent.id)}
        >
          {agent.folders.map((folder) => (
            <div key={folder.path} className="pb-1">
              <div className="flex items-center gap-3 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-label text-foreground/85">{homePath(folder.path)}</span>
                <span className="font-mono text-label text-muted-foreground">{formatBytes(folder.bytes)}</span>
                <RevealButton path={folder.path} />
              </div>
              {folder.children.map((child) => (
                <div key={`${child.path}-${child.id}`} className="flex items-center gap-3 py-0.5 pl-3 text-label text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate font-mono">{child.id}</span>
                  <SizeBar bytes={child.bytes} of={folder.bytes} color={colorOf(agent.id)} />
                  <span className="w-7 shrink-0" />
                </div>
              ))}
            </div>
          ))}
        </UsageRow>
      ))}
    </Card>
  );
}

function UsageRow({
  name,
  detail,
  bytes,
  color,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  detail: string;
  bytes: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} className="kontinue-hover flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left">
        <ChevronRight size={13} className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-foreground/90">{name}</span>
          <span className="block truncate font-mono text-caption text-muted-foreground">{detail}</span>
        </span>
        <span className="shrink-0 font-mono text-label text-muted-foreground">{formatBytes(bytes)}</span>
      </button>
      {expanded ? <div className="px-5 pb-4 pl-12">{children}</div> : null}
    </div>
  );
}

function SizeBar({ bytes, of, color }: { bytes: number; of: number; color: string }) {
  return (
    <>
      <span className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
        <span className="block h-full rounded-full" style={{ width: `${(bytes / Math.max(of, 1)) * 100}%`, backgroundColor: color }} />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-caption text-muted-foreground">{formatBytes(bytes)}</span>
    </>
  );
}

function RevealButton({ path, disabled }: { path: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      title="Show in Finder"
      disabled={disabled}
      onClick={() => reveal(path)}
      className="kontinue-hover flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-30"
    >
      <FolderOpen size={12} />
    </button>
  );
}

function localStorageBytes(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? "";
      total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    }
  } catch {
    // Storage unavailable.
  }
  return total;
}

function AppStateCard() {
  const watches = usePrWatches();
  const [bytes, setBytes] = useState(localStorageBytes);
  const finished = Object.values(watches).filter((w) => w.state === "MERGED" || w.state === "CLOSED").length;

  return (
    <Card title="App data on this Mac">
      <Row label="Preferences and local state" description="Settings, queued tasks, PR watches, drafts and layout. Chats live in your account, not here.">
        <span className="font-mono text-label text-muted-foreground">{formatBytes(bytes)}</span>
      </Row>
      <Row
        label="Finished pull requests"
        description={
          finished
            ? `${finished} merged or closed PR${finished === 1 ? "" : "s"} still remembered by the PR watcher.`
            : "Nothing to clean up."
        }
      >
        <PillButton
          disabled={!finished}
          onClick={() => {
            clearFinishedPrWatches();
            setBytes(localStorageBytes());
          }}
        >
          Clear
        </PillButton>
      </Row>
    </Card>
  );
}

const DAY_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

function CleanupRules({ onRan }: { onRan: () => void }) {
  const settings = useAppSettings();
  const deps = useCleanupDeps();
  const last = useLastCleanup();
  const [running, setRunning] = useState(false);
  const [showLast, setShowLast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = cleanupEnabled(settings);

  const deleteNow = async () => {
    const ok = await ask("Run the cleanup rules now? Matching worktrees are removed (their branches are kept).", {
      title: "Delete now",
      kind: "warning",
      okLabel: "Delete now",
    }).catch(() => false);
    if (!ok) return;
    setRunning(true);
    setError(null);
    try {
      await runCleanup(deps);
      setShowLast(true);
      onRan();
    } catch (cause) {
      setError(staleBuildMessage(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Card title="Worktrees">
        <Row
          label="Worktree location"
          description="Folder where new worktrees are created, like ~/worktrees. Existing worktrees stay where they are. Leave empty for ~/.kontinue/worktrees."
        >
          <TextField
            value={settings.worktreeLocation}
            onChange={(value) => updateSettings({ worktreeLocation: value })}
            placeholder="Default"
            className="w-56 rounded-xl font-mono"
          />
        </Row>
        <Row
          label="Delete worktrees with deleted threads"
          description="Remove worktrees no thread uses anymore (deleted or archived). The branch is kept."
        >
          <Switch
            checked={settings.cleanupDeletedThreads}
            onCheckedChange={(checked) => updateSettings({ cleanupDeletedThreads: checked })}
          />
        </Row>
        <Row
          label="Delete inactive worktrees"
          description="Remove worktrees after their threads have been inactive for this long. Branches and thread history are kept."
        >
          <Select
            value={String(settings.cleanupInactiveDays)}
            minWidth={120}
            options={DAY_OPTIONS}
            onChange={(value) => updateSettings({ cleanupInactiveDays: Number(value) })}
          />
        </Row>
        <Row label="Delete merged worktrees" description="Remove worktrees whose pull request has merged.">
          <Switch checked={settings.cleanupMerged} onCheckedChange={(checked) => updateSettings({ cleanupMerged: checked })} />
        </Row>
        <Row label="Delete unchanged worktrees" description="Remove worktrees with no commits beyond the default branch and no local edits.">
          <Switch
            checked={settings.cleanupUnchanged}
            onCheckedChange={(checked) => updateSettings({ cleanupUnchanged: checked })}
          />
        </Row>
        <Row
          label="Keep worktrees with local changes"
          description={
            settings.cleanupKeep === "none"
              ? "Matching worktrees are removed even with uncommitted edits. Those edits are lost."
              : "Kept worktrees are listed under Last run. Ignored files, including .env, go with the worktree."
          }
        >
          <Select
            value={settings.cleanupKeep}
            options={[
              { value: "uncommitted", label: "Uncommitted changes" },
              { value: "unpushed", label: "Uncommitted or unpushed", description: "Also keep commits not on a remote" },
              { value: "none", label: "Never keep", description: "Delete local changes too" },
            ]}
            onChange={(value) => updateSettings({ cleanupKeep: value })}
          />
        </Row>
      </Card>

      <Card title="Artifacts">
        <Row
          label="Delete old attachments and snapshots"
          description="Files Kode saved in your projects' .kode/attachments folders (pasted images, snapshots). Nothing else in a project is touched."
        >
          <Select
            value={String(settings.cleanupAttachmentsDays)}
            minWidth={120}
            options={DAY_OPTIONS}
            onChange={(value) => updateSettings({ cleanupAttachmentsDays: Number(value) })}
          />
        </Row>
      </Card>

      <Card title="Cleanup">
        <Row
          label="Delete now"
          description={enabled ? "Runs the rules above now. They also run on their own every few hours while Kontinue is open." : "Turn on a cleanup rule to use this."}
        >
          <PillButton onClick={() => void deleteNow()} disabled={!enabled || running}>
            {running ? <Loader2 size={12} className="animate-spin" /> : null}
            Delete now
          </PillButton>
        </Row>
        {last ? (
          <div className="px-5 py-3">
            <button
              type="button"
              onClick={() => setShowLast((v) => !v)}
              className="flex cursor-pointer items-center gap-2 text-body font-medium text-foreground/90"
            >
              <ChevronRight size={13} className={showLast ? "rotate-90 transition-transform" : "transition-transform"} />
              Last run
              <span className="font-normal text-muted-foreground">
                {last.removed.length} removed, {last.kept.length} kept
                {last.attachments.removed ? `, ${last.attachments.removed} files (${formatBytes(last.attachments.bytes)})` : ""}
                {" · "}
                {new Date(last.at).toLocaleString()}
              </span>
            </button>
            {showLast ? (
              <ul className="mt-2 space-y-1 pl-5 text-label text-muted-foreground">
                {last.removed.map((entry) => (
                  <li key={`r-${entry.path}`}>
                    <span className="text-foreground/80">Removed</span> <span className="font-mono">{entry.branch}</span> · {entry.reason} · {formatBytes(entry.bytes)}
                  </li>
                ))}
                {last.kept.map((entry) => (
                  <li key={`k-${entry.path}`}>
                    <span className="text-foreground/80">Kept</span> <span className="font-mono">{entry.branch}</span> · {entry.reason}
                  </li>
                ))}
                {last.errors.map((err) => (
                  <li key={err} className="text-rose-500">
                    {err}
                  </li>
                ))}
                {!last.removed.length && !last.kept.length && !last.errors.length ? <li>Nothing matched.</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>
      {error ? <p className="-mt-5 mb-6 px-1 text-label text-amber-600 dark:text-amber-400">{error}</p> : null}
    </>
  );
}
