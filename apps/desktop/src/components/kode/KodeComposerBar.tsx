import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  Cloud,
  Folder,
  FolderPlus,
  GitBranch,
  GitFork,
  Laptop,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { type KodeProject, useKodeWorkspace } from "../../lib/kode-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { BranchPicker, useBranches } from "./BranchPicker";

const errorText = (error: unknown) =>
  typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

/** Pill trigger used by all three pickers. */
function BarButton({
  icon,
  label,
  ...props
}: { icon: ReactNode; label: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-6 max-w-[160px] cursor-pointer items-center gap-1 rounded-md px-1 text-[11px] text-foreground/70 transition-colors hover:bg-black/[0.04] hover:text-foreground disabled:cursor-default disabled:opacity-45 data-[state=open]:bg-black/[0.05] dark:hover:bg-white/[0.06] dark:data-[state=open]:bg-white/[0.07]"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      <ChevronDown size={9} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Search field inside a menu; stops the menu from stealing keystrokes. */
function MenuSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 pt-1.5 pb-2">
      <Search size={12} className="shrink-0 text-muted-foreground" />
      <input
        // biome-ignore lint/a11y/noAutofocus: the search field should take focus when the menu opens
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

/** Inline "name it" field (new branch / new worktree). */
function NameField({
  placeholder,
  busy,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex items-center gap-1.5 px-2 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: the name field should take focus when it opens
        autoFocus
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="kontinue-3d h-8 min-w-0 flex-1 rounded-full px-3 text-[12px] outline-none placeholder:text-muted-foreground/60"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3 text-[12px] font-medium disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : "Create"}
      </button>
    </form>
  );
}

/**
 * Footer under the new-session composer: which project, where to work
 * (local folder or a new git worktree) and which branch. Renders nothing
 * when there is no project — the caller should omit the footer entirely.
 */
export function KodeComposerBar({
  project,
  end,
}: {
  project: KodeProject | null;
  /** Sits in the banner, to the left of the branch. */
  end?: ReactNode;
}) {
  const { projects, newChat, importFolder, ensureFolder } = useKodeWorkspace();
  const projectPath = project?.path ?? null;
  const inWorktree = !!projectPath && projectPath.includes("/.kontinue/worktrees/");

  // Project picker
  const [projectQuery, setProjectQuery] = useState("");
  const visibleProjects = projects.filter((p: KodeProject) =>
    `${p.name} ${p.path}`.toLowerCase().includes(projectQuery.trim().toLowerCase()),
  );

  // Work in → new worktree
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  const { branches, reload: reloadBranches } = useBranches(projectPath);

  const createWorktree = async (branch: string) => {
    if (!projectPath) return;
    setWorktreeBusy(true);
    setWorktreeError(null);
    try {
      const path = await invoke<string>("panel_git_worktree_add", {
        root: projectPath,
        branch,
      });
      newChat(ensureFolder(path));
      setWorktreeOpen(false);
    } catch (error) {
      setWorktreeError(errorText(error));
    } finally {
      setWorktreeBusy(false);
    }
  };

  if (!project || !projectPath) return null;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {/* Project */}
        <DropdownMenu
          onOpenChange={(open: boolean) => {
            if (!open) setProjectQuery("");
          }}
        >
          <DropdownMenuTrigger asChild>
            <BarButton icon={<Folder size={12} />} label={project.name} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-72 p-1.5">
            <MenuSearch
              value={projectQuery}
              onChange={setProjectQuery}
              placeholder="Search projects"
            />
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {visibleProjects.map((p: KodeProject) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => newChat(p.id)}
                  className="flex items-center gap-2.5 px-3 py-1.5"
                >
                  <Folder size={12} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.name}</span>
                  {p.id === project?.id ? (
                    <Check size={12} className="shrink-0 text-purple-500" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              {visibleProjects.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-muted-foreground">No matching projects.</p>
              ) : null}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void importFolder()}
              className="flex items-center gap-2.5 px-3 py-1.5"
            >
              <FolderPlus size={12} className="shrink-0" />
              <span className="text-[12.5px]">Add project folder…</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => newChat(null)}
              className="flex items-center gap-2.5 px-3 py-1.5"
            >
              <X size={12} className="shrink-0" />
              <span className="text-[12.5px]">Don't work in a project</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Work in */}
        <DropdownMenu
          onOpenChange={(open: boolean) => {
            if (!open) {
              setWorktreeOpen(false);
              setWorktreeError(null);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <BarButton
              icon={inWorktree ? <GitFork size={12} /> : <Laptop size={12} />}
              label={inWorktree ? "Worktree" : "Local"}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-72 p-1.5">
            <p className="px-3 pt-1 pb-1 text-[10.5px] font-medium text-muted-foreground/70">
              Work in
            </p>
            <DropdownMenuItem className="flex items-center gap-2.5 px-3 py-1.5">
              <Laptop size={12} className="shrink-0" />
              <span className="flex-1 text-[12.5px]">{inWorktree ? "This worktree" : "Local"}</span>
              <Check size={12} className="shrink-0 text-purple-500" />
            </DropdownMenuItem>
            {worktreeOpen ? (
              <>
                <NameField
                  placeholder="Branch for the new worktree"
                  busy={worktreeBusy}
                  onSubmit={(name) => void createWorktree(name)}
                  onCancel={() => setWorktreeOpen(false)}
                />
                {worktreeError ? (
                  <p className="px-3 pb-1.5 text-[11px] text-rose-400">{worktreeError}</p>
                ) : null}
              </>
            ) : (
              <DropdownMenuItem
                onSelect={(event: Event) => {
                  event.preventDefault();
                  setWorktreeOpen(true);
                }}
                className="flex items-center gap-2.5 px-3 py-1.5"
              >
                <GitFork size={12} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px]">New worktree</span>
                  <span className="block text-[10.5px] text-muted-foreground">
                    Separate folder on its own branch
                  </span>
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled className="flex items-center gap-2.5 px-3 py-1.5">
              <Cloud size={12} className="shrink-0" />
              <span className="flex-1 text-[12.5px]">Cloud</span>
              <span className="rounded-full border border-black/10 px-1.5 text-[9.5px] text-muted-foreground dark:border-white/10">
                Soon
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {end}
        <BranchPicker
          root={projectPath}
          repoName={project.name}
          align="end"
          onChanged={() => void reloadBranches()}
        >
          <BarButton icon={<GitBranch size={12} />} label={branches?.current ?? "Branch"} />
        </BranchPicker>
      </div>
    </>
  );
}
