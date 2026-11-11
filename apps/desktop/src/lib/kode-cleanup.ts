// Settings → Storage cleanup rules: remove worktrees Kode no longer needs and
// old saved attachments. Runs a minute after launch, every 6 hours, and from
// "Delete now". Branches are always kept; worktrees with local changes are
// kept unless "Keep worktrees with local changes" says otherwise.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { getSettings, useAppSettings, type AppSettings } from "./app-settings";
import { useKodeAgentRuntime, type ChatRunStatus } from "./kode-agent-runtime";
import { getPrWatches } from "./kode-pr-watch";
import { useKodeWorkspace, type KodeChat, type KodeFolder } from "./kode-workspace";

export type Worktree = {
  path: string;
  repo: string;
  branch: string;
  bytes: number;
  changes: number;
  modified: number;
  ahead: number | null;
  unpushed: number | null;
  defaultBranch: string | null;
};

export type CleanupEntry = { path: string; branch: string; reason: string; bytes: number };
export type CleanupRun = {
  at: number;
  removed: CleanupEntry[];
  kept: CleanupEntry[];
  attachments: { removed: number; bytes: number };
  errors: string[];
};

const DAY = 86_400_000;
const LAST_RUN_KEY = "kode.cleanup.last-run";

export function cleanupEnabled(s: AppSettings): boolean {
  return s.cleanupDeletedThreads || s.cleanupInactiveDays > 0 || s.cleanupMerged || s.cleanupUnchanged || s.cleanupAttachmentsDays > 0;
}

// Last run, shown under "Delete now".
let lastRun: CleanupRun | null = (() => {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY);
    return raw ? (JSON.parse(raw) as CleanupRun) : null;
  } catch {
    return null;
  }
})();
const listeners = new Set<() => void>();
function saveRun(run: CleanupRun) {
  lastRun = run;
  try {
    localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run));
  } catch {
    // Memory only.
  }
  for (const listener of listeners) listener();
}
export function useLastCleanup(): CleanupRun | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lastRun,
  );
}

export function listWorktrees(): Promise<Worktree[]> {
  return invoke<Worktree[]>("settings_list_worktrees", { location: getSettings().worktreeLocation.trim() || null });
}

type Deps = {
  chats: KodeChat[];
  folders: KodeFolder[];
  activeChatId: string | null;
  statusByChat: Record<string, ChatRunStatus>;
  removeFolder: (folderId: string) => void;
};

/** Why a worktree should go, or null to leave it. */
function matchRule(tree: Worktree, chats: KodeChat[], s: AppSettings, now: number): string | null {
  if (s.cleanupDeletedThreads && chats.length === 0) return "No thread uses it";
  if (s.cleanupMerged) {
    const merged = Object.values(getPrWatches()).some((w) => w.head === tree.branch && w.state === "MERGED");
    if (merged) return "Pull request merged";
  }
  if (s.cleanupUnchanged && tree.ahead === 0 && tree.changes === 0) return `No commits beyond ${tree.defaultBranch ?? "the default branch"}`;
  if (s.cleanupInactiveDays > 0) {
    const last = Math.max(tree.modified * 1000, ...chats.map((c) => c.updatedAt));
    if (now - last > s.cleanupInactiveDays * DAY) return `Inactive for ${s.cleanupInactiveDays}+ days`;
  }
  return null;
}

function keepReason(tree: Worktree, s: AppSettings): string | null {
  if (s.cleanupKeep === "none") return null;
  if (tree.changes > 0) return `${tree.changes} uncommitted change${tree.changes === 1 ? "" : "s"}`;
  if (s.cleanupKeep === "unpushed" && (tree.unpushed ?? 0) > 0) return `${tree.unpushed} unpushed commit${tree.unpushed === 1 ? "" : "s"}`;
  return null;
}

export async function runCleanup(deps: Deps): Promise<CleanupRun> {
  const s = getSettings();
  const now = Date.now();
  const run: CleanupRun = { at: now, removed: [], kept: [], attachments: { removed: 0, bytes: 0 }, errors: [] };

  const anyWorktreeRule = s.cleanupDeletedThreads || s.cleanupInactiveDays > 0 || s.cleanupMerged || s.cleanupUnchanged;
  if (anyWorktreeRule) {
    const trees = await listWorktrees();
    for (const tree of trees) {
      const folderIds = deps.folders.filter((f) => f.path === tree.path || f.path.startsWith(`${tree.path}/`)).map((f) => f.id);
      const chats = deps.chats.filter((c) => c.projectId && folderIds.includes(c.projectId));
      const entry = { path: tree.path, branch: tree.branch, bytes: tree.bytes };
      // Never pull a worktree out from under an open or running thread.
      const busy = chats.some((c) => c.id === deps.activeChatId || (deps.statusByChat[c.id] ?? "idle") !== "idle");
      const reason = matchRule(tree, chats, s, now);
      if (!reason) continue;
      if (busy) {
        run.kept.push({ ...entry, reason: "A thread in it is open or running" });
        continue;
      }
      const keep = keepReason(tree, s);
      if (keep) {
        run.kept.push({ ...entry, reason: keep });
        continue;
      }
      try {
        await invoke("settings_remove_worktree", { path: tree.path, force: tree.changes > 0, location: s.worktreeLocation.trim() || null });
        run.removed.push({ ...entry, reason });
        // Drop sidebar folders that pointed into it and have no threads.
        if (!chats.length) for (const id of folderIds) deps.removeFolder(id);
      } catch (error) {
        run.errors.push(`${tree.branch}: ${String(error)}`);
      }
    }
  }

  if (s.cleanupAttachmentsDays > 0) {
    const roots = deps.folders.map((f) => f.path).filter(Boolean);
    run.attachments = await invoke<{ removed: number; bytes: number }>("settings_clean_attachments", {
      roots,
      days: s.cleanupAttachmentsDays,
    }).catch((error) => {
      run.errors.push(String(error));
      return { removed: 0, bytes: 0 };
    });
  }

  saveRun(run);
  return run;
}

/** Hook for "Delete now" and the automatic runs. */
export function useCleanupDeps(): Deps {
  const { kodeChats, folders, activeChatId, removeFolder } = useKodeWorkspace();
  const { statusByChat } = useKodeAgentRuntime();
  return { chats: kodeChats, folders, activeChatId, statusByChat, removeFolder };
}

export function useAutoCleanup() {
  const settings = useAppSettings();
  const deps = useCleanupDeps();
  const latest = useRef(deps);
  latest.current = deps;
  const enabled = cleanupEnabled(settings);

  useEffect(() => {
    if (!enabled) return;
    const sweep = () => void runCleanup(latest.current).catch(() => {});
    const first = window.setTimeout(sweep, 60_000);
    const timer = window.setInterval(sweep, 6 * 60 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
