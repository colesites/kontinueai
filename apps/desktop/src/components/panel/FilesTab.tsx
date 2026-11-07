import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [treeWidth, setTreeWidth] = useState(readTreeWidth);
  const [trackedProject, setTrackedProject] = useState(projectPath);
  const dirtyRef = useRef(false);
  // A new folder starts from an empty tree. Doing this while rendering keeps
  // the reset tied to the prop without an effect dependency.
  if (trackedProject !== projectPath) {
    setTrackedProject(projectPath);
    setChildren({});
    setExpanded(new Set([""]));
    setOpenFile(initialPath);
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
    if (initialPath) setOpenFile(initialPath);
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
    if (path === openFile) return;
    if (dirtyRef.current && !window.confirm("Discard unsaved changes?")) return;
    dirtyRef.current = false;
    setOpenFile(path);
  };

  const closeFile = () => {
    if (dirtyRef.current && !window.confirm("Discard unsaved changes?")) return;
    dirtyRef.current = false;
    setOpenFile(null);
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

  const renderDir = (dir: string, depth: number): React.ReactNode =>
    (children[dir] ?? [])
      .filter((entry) => !needle || entry.is_dir || entry.path.toLowerCase().includes(needle))
      .map((entry) => {
        const isOpen = expanded.has(entry.path);
        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => (entry.is_dir ? toggleDir(entry.path) : openPath(entry.path))}
              style={{ paddingLeft: 8 + depth * 12 }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-1.5 rounded-md py-[5px] pr-2 text-left text-[12.5px] transition-colors",
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
            {entry.is_dir && isOpen ? renderDir(entry.path, depth + 1) : null}
          </div>
        );
      });

  return (
    <div ref={splitRef} className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col" style={{ minWidth: MIN_EDITOR }}>
        {openFile ? (
          <FileEditor
            key={openFile}
            root={projectPath}
            path={openFile}
            onClose={closeFile}
            onOpenInTab={onOpenInTab}
            onDirty={(dirty) => {
              dirtyRef.current = dirty;
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <Folder size={22} strokeWidth={1.25} className="text-foreground/25" />
            <p className="text-[13px] text-foreground/75">Open files appear here</p>
            <p className="max-w-[14rem] text-[12px] leading-relaxed text-muted-foreground">
              Pick a file in the tree.
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
              title="Refresh"
              onClick={refresh}
              className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
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

function FileEditor({
  root,
  path,
  onClose,
  onOpenInTab,
  onDirty,
}: {
  root: string;
  path: string;
  onClose: () => void;
  onOpenInTab?: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const file = useProjectFile(root, path);

  useEffect(() => {
    onDirty(file.dirty);
  }, [file.dirty, onDirty]);

  const name = path.split("/").pop() ?? path;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-black/[0.06] px-2 dark:border-white/[0.06]">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground/80" title={path}>
          {file.dirty ? <span className="mr-1.5 inline-block size-1.5 rounded-full bg-foreground/50 align-middle" /> : null}
          {name}
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
        <button
          type="button"
          aria-label="Close file"
          onClick={onClose}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
        >
          <X size={12} />
        </button>
      </div>
      {file.error ? <p className="px-3 pt-2 text-[11.5px] text-rose-400">{file.error}</p> : null}
      {file.draft === null && !file.error ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : file.draft !== null ? (
        <div className="min-h-0 flex-1">
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
