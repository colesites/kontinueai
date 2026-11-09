import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { useProjectFile } from "@/components/editor/use-project-file";
import { errorText, listDir, type FileEntry } from "./panel-api";

const HIDDEN = new Set([".git", ".DS_Store"]);
const TREE_WIDTH_KEY = "kontinue.files.treeWidth";
const MIN_TREE = 160;
const MIN_EDITOR = 140;
const DEFAULT_TREE = 240;

function readTreeWidth() {
  try {
    const width = Number(localStorage.getItem(TREE_WIDTH_KEY));
    return Number.isFinite(width) && width >= MIN_TREE ? width : DEFAULT_TREE;
  } catch {
    return DEFAULT_TREE;
  }
}

export function FilesTab({
  projectPath,
  active,
  onOpenInTab,
  initialPath = null,
}: {
  projectPath: string;
  active: boolean;
  onOpenInTab?: (path: string) => void;
  initialPath?: string | null;
}) {
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [loadingDir, setLoadingDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openFile, setOpenFile] = useState<string | null>(initialPath);
  const [tabs, setTabs] = useState<string[]>(initialPath ? [initialPath] : []);
  // Inline name field: renaming an entry, or creating one inside a folder.
  const [editing, setEditing] = useState<
    { kind: "rename"; path: string; isDir: boolean } | { kind: "create"; dir: string; isDir: boolean } | null
  >(null);
  const [treeWidth, setTreeWidth] = useState(readTreeWidth);
  const [trackedProject, setTrackedProject] = useState(projectPath);
  const dirtyRef = useRef(new Set<string>());
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set());
  // A new folder starts from an empty tree. Doing this while rendering keeps
  // the reset tied to the prop without an effect dependency.
  if (trackedProject !== projectPath) {
    setTrackedProject(projectPath);
    setChildren({});
    setExpanded(new Set([""]));
    setOpenFile(initialPath);
    setTabs(initialPath ? [initialPath] : []);
  }
  const splitRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const load = useCallback(
    async (dir: string) => {
      setLoadingDir(dir);
      try {
        const entries = await listDir(projectPath, dir);
        setChildren((current) => ({
          ...current,
          [dir]: entries.filter((e) => !HIDDEN.has(e.name)),
        }));
        setError(null);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoadingDir(null);
      }
    },
    [projectPath],
  );

  useEffect(() => {
    if (!initialPath) return;
    setTabs((current) => (current.includes(initialPath) ? current : [...current, initialPath]));
    setOpenFile(initialPath);
  }, [initialPath]);

  useEffect(() => {
    if (active && !children[""]) void load("");
  }, [active, children, load]);

  const toggleDir = (dir: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        if (!children[dir]) void load(dir);
      }
      return next;
    });
  };

  const refresh = () => {
    setChildren({});
    for (const dir of expanded) void load(dir);
  };

  const openPath = (path: string) => {
    setTabs((current) => (current.includes(path) ? current : [...current, path]));
    setOpenFile(path);
  };

  const closeTab = (path: string) => {
    if (dirtyRef.current.has(path) && !window.confirm(`Discard unsaved changes to ${path.split("/").pop()}?`)) return;
    dirtyRef.current.delete(path);
    setTabs((current) => {
      const index = current.indexOf(path);
      const next = current.filter((tab) => tab !== path);
      if (openFile === path) setOpenFile(next[Math.min(index, next.length - 1)] ?? null);
      return next;
    });
  };

  const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

  const commitName = async (rawName: string) => {
    const target = editing;
    setEditing(null);
    const name = rawName.trim();
    if (!target || !name) return;
    if (name.includes("..") || name.startsWith("/")) {
      setError("Use a plain name or a relative path inside the folder.");
      return;
    }
    try {
      if (target.kind === "create") {
        const path = target.dir ? `${target.dir}/${name}` : name;
        await invoke("kode_create_entry", { root: projectPath, path, isDir: target.isDir });
        await load(target.dir);
        if (target.isDir) setExpanded((current) => new Set(current).add(path));
        else openPath(path);
      } else {
        const dir = parentOf(target.path);
        const next = dir ? `${dir}/${name}` : name;
        if (next === target.path) return;
        await invoke("kode_rename_path", { root: projectPath, from: target.path, to: next });
        // Open tabs follow the file (or everything under a renamed folder).
        const move = (path: string) => (under(path, target.path) ? next + path.slice(target.path.length) : path);
        setTabs((current) => current.map(move));
        setOpenFile((current) => (current ? move(current) : current));
        dirtyRef.current = new Set([...dirtyRef.current].map(move));
        await load(dir);
        if (parentOf(next) !== dir) await load(parentOf(next));
      }
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const trash = async (path: string, isDir: boolean) => {
    const name = path.split("/").pop() ?? path;
    if (!window.confirm(`Move ${isDir ? "the folder " : ""}${name} to the Trash?`)) return;
    try {
      await invoke("kode_trash_path", { root: projectPath, path });
      const left = tabs.filter((tab) => !under(tab, path));
      for (const tab of tabs) if (under(tab, path)) dirtyRef.current.delete(tab);
      setTabs(left);
      if (openFile && under(openFile, path)) setOpenFile(left[left.length - 1] ?? null);
      await load(parentOf(path));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const startCreate = (dir: string, isDir: boolean) => {
    if (dir) setExpanded((current) => new Set(current).add(dir));
    if (dir && !children[dir]) void load(dir);
    setEditing({ kind: "create", dir, isDir });
  };

  const startTreeResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = treeRef.current?.getBoundingClientRect().width ?? treeWidth;
    let next = startWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const available = splitRef.current?.clientWidth ?? startWidth + MIN_EDITOR;
      const max = Math.max(MIN_TREE, available - MIN_EDITOR);
      next = Math.min(max, Math.max(MIN_TREE, startWidth + startX - ev.clientX));
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (treeRef.current) treeRef.current.style.width = `${next}px`;
      });
    };
    const onUp = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setTreeWidth(next);
      try {
        localStorage.setItem(TREE_WIDTH_KEY, String(next));
      } catch {
        // The width still applies for this session.
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resizeTreeBy = (delta: number) => {
    const available = splitRef.current?.clientWidth ?? treeWidth + MIN_EDITOR;
    const max = Math.max(MIN_TREE, available - MIN_EDITOR);
    const next = Math.min(max, Math.max(MIN_TREE, treeWidth + delta));
    setTreeWidth(next);
    try {
      localStorage.setItem(TREE_WIDTH_KEY, String(next));
    } catch {
      // The width still applies for this session.
    }
  };

  const onTreeResizeKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeTreeBy(16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeTreeBy(-16);
    }
  };

  const needle = filter.trim().toLowerCase();

  const nameField = (depth: number, isDir: boolean, initial: string) => (
    <div style={{ paddingLeft: 8 + depth * 12 }} className="flex items-center gap-1.5 py-[3px] pr-2">
      <span className="w-3 shrink-0" />
      {isDir ? <Folder size={13} className="shrink-0 text-purple-500/80" /> : <File size={13} className="shrink-0 text-muted-foreground" />}
      <input
        autoFocus
        defaultValue={initial}
        onFocus={(e) => {
          const dot = e.currentTarget.value.lastIndexOf(".");
          e.currentTarget.setSelectionRange(0, isDir || dot <= 0 ? e.currentTarget.value.length : dot);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commitName(e.currentTarget.value);
          if (e.key === "Escape") setEditing(null);
        }}
        onBlur={(e) => void commitName(e.currentTarget.value)}
        aria-label={isDir ? "Folder name" : "File name"}
        className="min-w-0 flex-1 rounded-md border border-purple-500/40 bg-transparent px-1.5 py-0.5 text-[12.5px] outline-none"
      />
    </div>
  );

  const renderDir = (dir: string, depth: number): React.ReactNode => (
    <>
      {editing?.kind === "create" && editing.dir === dir ? nameField(depth, editing.isDir, "") : null}
      {(children[dir] ?? [])
        .filter((entry) => !needle || entry.is_dir || entry.path.toLowerCase().includes(needle))
        .map((entry) => {
          const isOpen = expanded.has(entry.path);
          if (editing?.kind === "rename" && editing.path === entry.path) {
            return <div key={entry.path}>{nameField(depth, entry.is_dir, entry.name)}</div>;
          }
          return (
            <div key={entry.path}>
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => (entry.is_dir ? toggleDir(entry.path) : openPath(entry.path))}
                  onDoubleClick={() => setEditing({ kind: "rename", path: entry.path, isDir: entry.is_dir })}
                  style={{ paddingLeft: 8 + depth * 12 }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-1.5 rounded-md py-[5px] pr-7 text-left text-[12.5px] transition-colors",
                    !entry.is_dir && entry.path === openFile
                      ? "bg-black/[0.06] text-foreground dark:bg-white/[0.08]"
                      : "text-foreground/85 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                  )}
                >
                  {entry.is_dir ? (
                    <ChevronRight
                      size={12}
                      className={cn("shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                    />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  {entry.is_dir ? (
                    isOpen ? (
                      <FolderOpen size={13} className="shrink-0 text-purple-500/80" />
                    ) : (
                      <Folder size={13} className="shrink-0 text-purple-500/80" />
                    )
                  ) : (
                    <File size={13} className="shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{entry.name}</span>
                  {loadingDir === entry.path ? (
                    <Loader2 size={11} className="ml-auto shrink-0 animate-spin text-muted-foreground" />
                  ) : null}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Actions for ${entry.name}`}
                      className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal size={12} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {entry.is_dir ? (
                      <>
                        <DropdownMenuItem onSelect={() => startCreate(entry.path, false)}>
                          <FilePlus size={13} /> New file
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => startCreate(entry.path, true)}>
                          <FolderPlus size={13} /> New folder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setEditing({ kind: "rename", path: entry.path, isDir: entry.is_dir })}>
                      <Pencil size={13} /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void trash(entry.path, entry.is_dir)} className="text-rose-500 focus:text-rose-500">
                      <Trash2 size={13} /> Move to Trash
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {entry.is_dir && isOpen ? renderDir(entry.path, depth + 1) : null}
            </div>
          );
        })}
    </>
  );

  return (
    <div ref={splitRef} className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col" style={{ minWidth: MIN_EDITOR }}>
        {tabs.length > 0 ? (
          <>
            <div className="no-scrollbar flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-black/[0.06] px-1.5 dark:border-white/[0.06]">
              {tabs.map((tab) => (
                <div
                  key={tab}
                  title={tab}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(tab);
                    }
                  }}
                  className={cn(
                    "group flex h-7 shrink-0 items-center gap-1 rounded-full pr-1 pl-3 font-mono text-[11.5px] transition-colors",
                    tab === openFile ? "kontinue-menu-active text-foreground" : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
                  )}
                >
                  <button type="button" className="max-w-[11rem] cursor-pointer truncate" onClick={() => setOpenFile(tab)}>
                    {tab.split("/").pop()}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.split("/").pop()}`}
                    onClick={() => closeTab(tab)}
                    className="flex size-5 cursor-pointer items-center justify-center rounded-full opacity-60 hover:opacity-100"
                  >
                    <TabCloseIcon dirty={dirtyTabs.has(tab)} />
                  </button>
                </div>
              ))}
            </div>
            {tabs.map((tab) => (
              <div key={tab} className={cn("min-h-0 flex-1 flex-col", tab === openFile ? "flex" : "hidden")}>
                <FileEditor
                  root={projectPath}
                  path={tab}
                  onOpenInTab={onOpenInTab}
                  onDirty={(dirty) => {
                    const had = dirtyRef.current.has(tab);
                    if (dirty === had) return;
                    if (dirty) dirtyRef.current.add(tab);
                    else dirtyRef.current.delete(tab);
                    setDirtyTabs(new Set(dirtyRef.current));
                  }}
                />
              </div>
            ))}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <Folder size={22} strokeWidth={1.25} className="text-foreground/25" />
            <p className="text-[13px] text-foreground/75">Open files appear here</p>
            <p className="max-w-[14rem] text-[12px] leading-relaxed text-muted-foreground">
              Pick a file in the tree. Double-click a name to rename it.
            </p>
          </div>
        )}
      </div>

      <div
        ref={treeRef}
        className="relative flex shrink-0 flex-col border-l border-black/[0.06] dark:border-white/[0.06]"
        style={{ width: treeWidth, minWidth: MIN_TREE, maxWidth: `calc(100% - ${MIN_EDITOR}px)` }}
      >
        <hr
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize file tree"
          aria-valuemin={MIN_TREE}
          aria-valuenow={treeWidth}
          onPointerDown={startTreeResize}
          onKeyDown={onTreeResizeKey}
          className="absolute inset-y-0 left-0 z-20 m-0 h-auto w-1.5 cursor-ew-resize border-0 border-l border-transparent bg-transparent outline-none hover:border-purple-500/50 focus-visible:border-purple-500/50"
        />
        <div className="flex shrink-0 flex-col gap-1.5 px-2 py-2">
          <div className="kontinue-3d flex h-8 items-center gap-2 rounded-full px-3">
            <Search size={12} className="shrink-0 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files"
              className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="flex items-center">
            {onOpenInTab ? (
              <button
                type="button"
                title="Open files in a full tab"
                onClick={() => onOpenInTab(openFile ?? "")}
                className="flex h-7 cursor-pointer items-center rounded-full px-2 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Open in a full tab
              </button>
            ) : null}
            <button
              type="button"
              title="New file"
              aria-label="New file"
              onClick={() => startCreate("", false)}
              className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <FilePlus size={12} />
            </button>
            <button
              type="button"
              title="New folder"
              aria-label="New folder"
              onClick={() => startCreate("", true)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              title="Refresh"
              onClick={refresh}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={12} className={cn(loadingDir !== null && "animate-spin")} />
            </button>
          </div>
        </div>
        {error ? <p className="px-3 pb-2 text-[11px] text-rose-400">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
          {!children[""] ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            renderDir("", 0)
          )}
        </div>
      </div>
    </div>
  );
}

function TabCloseIcon({ dirty }: { dirty: boolean }) {
  // Like an editor: a dot while unsaved, the × on hover.
  if (!dirty) return <X size={11} />;
  return (
    <>
      <span className="size-1.5 rounded-full bg-foreground/60 group-hover:hidden" />
      <X size={11} className="hidden group-hover:block" />
    </>
  );
}

function FileEditor({
  root,
  path,
  onOpenInTab,
  onDirty,
}: {
  root: string;
  path: string;
  onOpenInTab?: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const file = useProjectFile(root, path);

  useEffect(() => {
    onDirty(file.dirty);
  }, [file.dirty, onDirty]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground" title={path}>
          {path}
        </span>
        {onOpenInTab ? (
          <button
            type="button"
            title="Open this file in a full tab"
            onClick={() => onOpenInTab?.(path)}
            className="flex h-6 shrink-0 cursor-pointer items-center rounded-full px-2 text-[11px] text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
          >
            Open in a full tab
          </button>
        ) : null}
        <button
          type="button"
          title="Save (⌘S)"
          disabled={!file.dirty || file.saving}
          onClick={() => void file.save()}
          className="flex h-6 shrink-0 cursor-pointer items-center rounded-full px-2 text-[11px] text-foreground/75 hover:text-foreground disabled:cursor-default disabled:text-muted-foreground/40"
        >
          {file.saving ? "Saving" : file.justSaved ? "Saved" : "Save"}
        </button>
      </div>
      {file.error ? <p className="px-3 pt-2 text-[11.5px] text-rose-400">{file.error}</p> : null}
      {file.draft === null && !file.error ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : file.draft !== null ? (
        <div className="min-h-0 flex-1" data-annotate-source={`File ${path}`}>
          <CodeEditor
            path={path}
            value={file.draft}
            onChange={file.setDraft}
            onSave={() => void file.save()}
          />
        </div>
      ) : null}
    </div>
  );
}
