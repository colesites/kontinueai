import { useCallback, useEffect, useState } from "react";
import type { BundledLanguage } from "shiki";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { CodeBlockContent } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";
import { errorText, listDir, readFile, type FileEntry } from "./panel-api";

const HIDDEN = new Set([".git", ".DS_Store"]);
const MAX_HIGHLIGHT_BYTES = 300_000;

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "jsonc", md: "markdown", mdx: "mdx", css: "css", scss: "scss", html: "html",
  rs: "rust", toml: "toml", yml: "yaml", yaml: "yaml", py: "python", go: "go", swift: "swift",
  kt: "kotlin", java: "java", rb: "ruby", php: "php", sh: "bash", zsh: "bash", sql: "sql",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", vue: "vue", svelte: "svelte",
  xml: "xml", graphql: "graphql", prisma: "prisma", dockerfile: "dockerfile",
};

function languageFor(path: string): BundledLanguage {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return (LANG_BY_EXT[ext] ?? "text") as BundledLanguage;
}

export function FilesTab({ projectPath, active }: { projectPath: string; active: boolean }) {
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [loadingDir, setLoadingDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openFile, setOpenFile] = useState<string | null>(null);

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

  // New project: reset and load its root.
  useEffect(() => {
    setChildren({});
    setExpanded(new Set([""]));
    setOpenFile(null);
  }, [projectPath]);

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

  if (openFile) {
    return <FileViewer root={projectPath} path={openFile} onBack={() => setOpenFile(null)} />;
  }

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
              onClick={() => (entry.is_dir ? toggleDir(entry.path) : setOpenFile(entry.path))}
              style={{ paddingLeft: 10 + depth * 14 }}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-full py-[5px] pr-3 text-left text-[12.5px] text-foreground/85 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-2">
        <div className="kontinue-3d flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3">
          <Search size={12} className="shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter loaded files"
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <button
          type="button"
          title="Refresh"
          onClick={refresh}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} className={cn(loadingDir !== null && "animate-spin")} />
        </button>
      </div>
      {error ? <p className="px-4 pb-2 text-[11px] text-rose-400">{error}</p> : null}
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
  );
}

function FileViewer({ root, path, onBack }: { root: string; path: string; onBack: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    readFile(root, path)
      .then((text) => !cancelled && setContent(text))
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [root, path]);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-2">
        <button
          type="button"
          aria-label="Back to files"
          onClick={onBack}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground/80" title={path}>
          {path}
        </span>
        <button
          type="button"
          title="Copy path"
          onClick={() => void copyPath()}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Copy size={11} />
          {copied ? "Copied" : "Path"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-t border-black/[0.05] text-[11.5px] dark:border-white/[0.05]">
        {error ? (
          <p className="p-4 text-[11.5px] text-rose-400">{error}</p>
        ) : content === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : content.length > MAX_HIGHLIGHT_BYTES ? (
          <pre className="p-3 font-mono whitespace-pre text-foreground/80">{content}</pre>
        ) : (
          <CodeBlockContent code={content} language={languageFor(path)} showLineNumbers />
        )}
      </div>
    </div>
  );
}
