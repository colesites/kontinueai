import { useEffect, useState, type ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, GitBranch, GitFork, Loader2, Plus, Search } from "lucide-react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Branches = {
  isRepo: boolean;
  current: string | null;
  branches: string[];
  uncommitted: number;
  /** Branches open in another worktree (a separate folder). */
  worktrees: { branch: string; path: string }[];
};

const errorText = (error: unknown) =>
  typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

/** Current branch for a folder, refreshed when the folder changes. */
export function useBranches(root: string | null) {
  const [branches, setBranches] = useState<Branches | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    if (!root) return;
    setError(null);
    try {
      setBranches(await invoke<Branches>("panel_git_branches", { root }));
    } catch (err) {
      setError(errorText(err));
    }
  };
  useEffect(() => {
    setBranches(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);
  return { branches, error, reload };
}

/**
 * Search, switch and create branches for `root`. `children` is the trigger.
 *
 * A branch that's open in another worktree can't be checked out here too (git
 * allows one folder per branch), so picking it opens that worktree instead.
 * With `onPickBase` the picker only chooses where a new worktree starts: it
 * never switches the project folder.
 */
export function BranchPicker({
  root,
  repoName,
  children,
  side = "top",
  align = "start",
  onChanged,
  onPickBase,
  base,
}: {
  root: string;
  repoName?: string | null;
  children: ReactElement;
  side?: "top" | "bottom";
  align?: "start" | "end";
  onChanged?: () => void;
  /** Base mode: the branch the next new worktree starts from. */
  onPickBase?: (branch: string | null) => void;
  /** Base mode: the chosen base (null = the folder's current branch). */
  base?: string | null;
}) {
  const { branches, error, reload } = useBranches(root);
  const { newChat, ensureFolder } = useKodeWorkspace();
  const baseMode = !!onPickBase;
  const openWorktree = (path: string) => {
    newChat(ensureFolder(path));
    setOpen(false);
  };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const switchTo = async (branch: string, create: boolean) => {
    setBusy(true);
    setActionError(null);
    try {
      await invoke("panel_git_switch", { root, branch, create });
      setCreating(false);
      setNewName("");
      setQuery("");
      await reload();
      onChanged?.();
      setOpen(false);
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const trimmed = query.trim();
  const list = (branches?.branches ?? []).filter((b) =>
    b.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const exact = (branches?.branches ?? []).some(
    (b) => b.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = Boolean(branches?.isRepo && trimmed && !exact && !baseMode);
  const worktreeOf = (branch: string) => branches?.worktrees?.find((t) => t.branch === branch) ?? null;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void reload();
        else {
          setQuery("");
          setCreating(false);
          setActionError(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-80 p-1.5"
      >
        {branches && !branches.isRepo ? (
          <p className="px-3 py-3 text-label text-muted-foreground">
            This folder isn't a git repository.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 pt-1.5 pb-2">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && canCreate && !busy) {
                    e.preventDefault();
                    void switchTo(trimmed, true);
                  }
                }}
                placeholder={`Search ${repoName ?? ""} branches`.replace(
                  "  ",
                  " ",
                )}
                className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <DropdownMenuSeparator />
            <p className="px-3 pt-1 pb-1 text-caption font-medium text-muted-foreground/70">
              {baseMode ? "New worktree starts from" : "Branches"}
            </p>
            <div className="max-h-64 overflow-y-auto">
              {!branches ? (
                <div className="flex justify-center py-4">
                  <Loader2
                    size={14}
                    className="animate-spin text-muted-foreground"
                  />
                </div>
              ) : list.length === 0 ? (
                <p className="px-3 py-2 text-label text-muted-foreground">
                  {trimmed ? "No matching branches." : "No branches yet."}
                </p>
              ) : (
                list.map((branch) => {
                  const isCurrent = branch === branches.current;
                  const tree = worktreeOf(branch);
                  const checked = baseMode ? (base ?? branches.current) === branch : isCurrent;
                  return (
                    <DropdownMenuItem
                      key={branch}
                      disabled={busy}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (baseMode) {
                          onPickBase?.(isCurrent ? null : branch);
                          setOpen(false);
                        } else if (tree) openWorktree(tree.path);
                        else if (!isCurrent) void switchTo(branch, false);
                      }}
                      title={!baseMode && tree ? `Open in its worktree: ${tree.path}` : undefined}
                      className="flex items-center gap-2.5 px-3 py-1.5"
                    >
                      {tree && !baseMode ? (
                        <GitFork size={13} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <GitBranch size={13} className="shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">
                          {branch}
                        </span>
                        {tree && !baseMode ? (
                          <span className="block truncate text-caption text-muted-foreground">
                            Open in a worktree · opens that folder
                          </span>
                        ) : null}
                        {isCurrent && branches.uncommitted > 0 ? (
                          <span className="block text-caption text-muted-foreground">
                            Uncommitted: {branches.uncommitted} file
                            {branches.uncommitted === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </span>
                      {checked ? (
                        <Check size={13} className="shrink-0 text-purple-500" />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>
            {error || actionError ? (
              <p className="px-3 py-1.5 text-caption text-rose-400">
                {actionError ?? error}
              </p>
            ) : null}
            {baseMode ? (
              <p className="px-3 pt-1.5 pb-1 text-caption leading-relaxed text-muted-foreground">
                The worktree gets its own new branch from here. Your project folder stays on{" "}
                {branches?.current ?? "its branch"}.
              </p>
            ) : (
            <>
            <DropdownMenuSeparator />
            {canCreate ? (
              <DropdownMenuItem
                disabled={busy}
                onSelect={(e) => {
                  e.preventDefault();
                  void switchTo(trimmed, true);
                }}
                className="flex items-center gap-2.5 px-3 py-1.5"
              >
                <Plus size={13} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-body">
                  Create and check out{" "}
                  <span className="font-medium">“{trimmed}”</span>
                </span>
              </DropdownMenuItem>
            ) : creating ? (
              <form
                className="flex items-center gap-1.5 px-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) void switchTo(newName.trim(), true);
                }}
              >
                <input
                  autoFocus
                  value={newName}
                  disabled={busy}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="new-branch-name"
                  className="kontinue-3d h-8 min-w-0 flex-1 rounded-full px-3 text-label outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3 text-label font-medium disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "Create"
                  )}
                </button>
              </form>
            ) : (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setCreating(true);
                }}
                className="flex items-center gap-2.5 px-3 py-1.5"
              >
                <Plus size={13} className="shrink-0" />
                <span className="text-body">
                  Create and check out new branch…
                </span>
              </DropdownMenuItem>
            )}
            </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
