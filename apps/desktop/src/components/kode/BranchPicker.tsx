import { useEffect, useState, type ReactElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, GitBranch, Loader2, Plus, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Branches = { isRepo: boolean; current: string | null; branches: string[]; uncommitted: number };

const errorText = (error: unknown) =>
  typeof error === "string" ? error : error instanceof Error ? error.message : "Something went wrong.";

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

/** Search, switch and create branches for `root`. `children` is the trigger. */
export function BranchPicker({
  root,
  repoName,
  children,
  side = "top",
  align = "start",
  onChanged,
}: {
  root: string;
  repoName?: string | null;
  children: ReactElement;
  side?: "top" | "bottom";
  align?: "start" | "end";
  onChanged?: () => void;
}) {
  const { branches, error, reload } = useBranches(root);
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
      await reload();
      onChanged?.();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const list = (branches?.branches ?? []).filter((b) => b.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void reload();
        else {
          setQuery("");
          setCreating(false);
          setActionError(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} sideOffset={8} className="w-80 p-1.5">
        {branches && !branches.isRepo ? (
          <p className="px-3 py-3 text-[12px] text-muted-foreground">This folder isn't a git repository.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 pt-1.5 pb-2">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder={`Search ${repoName ?? ""} branches`.replace("  ", " ")}
                className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <DropdownMenuSeparator />
            <p className="px-3 pt-1 pb-1 text-[10.5px] font-medium text-muted-foreground/70">Branches</p>
            <div className="max-h-64 overflow-y-auto">
              {!branches ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                list.map((branch) => {
                  const isCurrent = branch === branches.current;
                  return (
                    <DropdownMenuItem
                      key={branch}
                      disabled={busy}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (!isCurrent) void switchTo(branch, false);
                      }}
                      className="flex items-center gap-2.5 px-3 py-1.5"
                    >
                      <GitBranch size={13} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px]">{branch}</span>
                        {isCurrent && branches.uncommitted > 0 ? (
                          <span className="block text-[10.5px] text-muted-foreground">
                            Uncommitted: {branches.uncommitted} file{branches.uncommitted === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </span>
                      {isCurrent ? <Check size={13} className="shrink-0 text-purple-500" /> : null}
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>
            {error || actionError ? (
              <p className="px-3 py-1.5 text-[11px] text-rose-400">{actionError ?? error}</p>
            ) : null}
            <DropdownMenuSeparator />
            {creating ? (
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
                  className="kontinue-3d h-8 min-w-0 flex-1 rounded-full px-3 text-[12px] outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3 text-[12px] font-medium disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : "Create"}
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
                <span className="text-[12.5px]">Create and check out new branch…</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
