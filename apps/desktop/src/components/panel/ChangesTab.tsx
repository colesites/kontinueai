import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Columns2, Loader2, RefreshCw, Rows2, Space } from "lucide-react";
import { updateSettings, useAppSettings } from "@/lib/app-settings";
import { cn } from "@/lib/utils";
import {
  errorText,
  gitDiff,
  type GitFileChange,
  type GitStatus,
} from "./panel-api";
import { EmptyState } from "./WorkspacePanel";

type GitState = {
  status: GitStatus | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const STATUS_LETTER: Record<GitFileChange["status"], { letter: string; className: string }> = {
  modified: { letter: "M", className: "text-amber-500" },
  added: { letter: "A", className: "text-emerald-500" },
  untracked: { letter: "U", className: "text-emerald-500" },
  deleted: { letter: "D", className: "text-rose-500" },
  renamed: { letter: "R", className: "text-sky-500" },
};

export function ChangesTab({ projectPath, git }: { projectPath: string; git: GitState }) {
  // Settings → General: files start expanded or collapsed; a click overrides.
  const { diffDefaultCollapsed, diffHideWhitespace, diffLayout } = useAppSettings();
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const status = git.status;
  const isOpen = (path: string) => overrides.get(path) ?? !diffDefaultCollapsed;
  const anyOpen = status?.files.some((f) => isOpen(f.path)) ?? false;

  const toggle = (path: string) =>
    setOverrides((current) => new Map(current).set(path, !isOpen(path)));
  const setAll = (value: boolean) =>
    setOverrides(new Map((status?.files ?? []).map((f) => [f.path, value])));

  if (!status) {
    return (
      <EmptyState>
        {git.error ?? <Loader2 className="size-4 animate-spin" />}
      </EmptyState>
    );
  }
  if (!status.isRepo) {
    return <EmptyState>This folder isn't a git repository.</EmptyState>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-label text-muted-foreground">
        <span className="truncate">
          {status.branch ?? "HEAD"} → working tree
        </span>
        {status.files.length > 0 ? (
          <span className="font-mono">
            <span className="text-emerald-500">+{status.additions}</span>{" "}
            <span className="text-rose-500">−{status.deletions}</span>
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          {status.files.length > 0 ? (
            <>
              <button
                type="button"
                title={diffHideWhitespace ? "Show whitespace changes" : "Hide whitespace changes"}
                aria-pressed={diffHideWhitespace}
                onClick={() => updateSettings({ diffHideWhitespace: !diffHideWhitespace })}
                className={cn(
                  "flex size-6 cursor-pointer items-center justify-center rounded-full hover:text-foreground",
                  diffHideWhitespace && "text-purple-500",
                )}
              >
                <Space size={12} />
              </button>
              <button
                type="button"
                title={diffLayout === "split" ? "Stacked diff" : "Side-by-side diff"}
                onClick={() => updateSettings({ diffLayout: diffLayout === "split" ? "stacked" : "split" })}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full hover:text-foreground"
              >
                {diffLayout === "split" ? <Rows2 size={12} /> : <Columns2 size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setAll(!anyOpen)}
                className="cursor-pointer rounded-full px-2 py-0.5 kontinue-hover hover:text-foreground"
              >
                {anyOpen ? "Collapse all" : "Expand all"}
              </button>
            </>
          ) : null}
          <button
            type="button"
            title="Refresh"
            onClick={() => void git.refresh()}
            className="flex size-6 cursor-pointer items-center justify-center rounded-full hover:text-foreground"
          >
            <RefreshCw size={12} className={cn(git.loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {status.files.length === 0 ? (
        <EmptyState>No changes. The working tree matches {status.branch ?? "HEAD"}.</EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {status.files.map((file) => (
            <FileDiffRow
              key={file.path}
              root={projectPath}
              file={file}
              open={isOpen(file.path)}
              ignoreWhitespace={diffHideWhitespace}
              split={diffLayout === "split"}
              onToggle={() => toggle(file.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileDiffRow({
  root,
  file,
  open,
  onToggle,
  ignoreWhitespace,
  split,
}: {
  root: string;
  file: GitFileChange;
  open: boolean;
  onToggle: () => void;
  ignoreWhitespace: boolean;
  split: boolean;
}) {
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const marker = STATUS_LETTER[file.status];
  const slash = file.path.lastIndexOf("/");
  const name = file.path.slice(slash + 1);
  const dir = slash >= 0 ? file.path.slice(0, slash) : "";

  // Load (and reload when the line counts change) only while expanded.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    gitDiff(root, file.path, file.status === "untracked", ignoreWhitespace)
      .then((text) => !cancelled && (setDiff(text), setError(null)))
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [open, root, file.path, file.status, file.additions, file.deletions, ignoreWhitespace]);

  return (
    <div className="border-b border-black/[0.04] dark:border-white/[0.04]">
      <button
        type="button"
        onClick={onToggle}
        className="sticky top-0 z-10 flex w-full cursor-pointer items-center gap-2 bg-white/90 px-3 dark:bg-[#050506] py-1.5 text-left transition-colors kontinue-hover"
      >
        {open ? (
          <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
        )}
        <span className={cn("w-3 shrink-0 font-mono text-caption font-semibold", marker.className)}>
          {marker.letter}
        </span>
        <span className="min-w-0 flex-1 truncate text-label">
          <span className="text-foreground/90">{name}</span>
          {dir ? <span className="ml-1.5 text-muted-foreground/60">{dir}</span> : null}
        </span>
        <span className="shrink-0 font-mono text-caption">
          {file.additions > 0 ? <span className="text-emerald-500">+{file.additions}</span> : null}{" "}
          {file.deletions > 0 ? <span className="text-rose-500">−{file.deletions}</span> : null}
        </span>
      </button>
      {open ? (
        error ? (
          <p className="px-4 pb-2 text-caption text-rose-400">{error}</p>
        ) : diff === null ? (
          <div className="px-4 pb-3">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          split ? <SplitDiffView diff={diff} /> : <DiffView diff={diff} />
        )
      ) : null}
    </div>
  );
}

type DiffLine =
  | { kind: "hunk"; text: string }
  | { kind: "add" | "del" | "ctx"; text: string; oldNo: number | null; newNo: number | null };

const MAX_LINES = 1500;

function parseDiff(diff: string): { lines: DiffLine[]; binary: boolean } {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("Binary files")) return { lines: [], binary: true };
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: "hunk", text: hunk[3]?.trim() || "" });
      continue;
    }
    if (!inHunk || raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) lines.push({ kind: "add", text: raw.slice(1), oldNo: null, newNo: newNo++ });
    else if (raw.startsWith("-")) lines.push({ kind: "del", text: raw.slice(1), oldNo: oldNo++, newNo: null });
    else if (raw.startsWith(" ")) lines.push({ kind: "ctx", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
  }
  return { lines, binary: false };
}

function DiffView({ diff }: { diff: string }) {
  const [showAll, setShowAll] = useState(false);
  const { lines, binary } = parseDiff(diff);
  if (binary) return <p className="px-4 pb-2 text-caption text-muted-foreground">Binary file changed.</p>;
  if (lines.length === 0) return <p className="px-4 pb-2 text-caption text-muted-foreground">No text changes.</p>;
  const visible = showAll ? lines : lines.slice(0, MAX_LINES);

  return (
    <div className="overflow-x-auto pb-1 font-mono text-label leading-[1.55]">
      <table className="w-full border-collapse">
        <tbody>
          {visible.map((line, index) =>
            line.kind === "hunk" ? (
              <tr key={index} className="bg-purple-500/[0.06] text-muted-foreground/70">
                <td colSpan={3} className="px-3 py-0.5 text-caption">
                  ⋯ {line.text}
                </td>
              </tr>
            ) : (
              <tr
                key={index}
                className={cn(
                  line.kind === "add" && "bg-emerald-500/[0.10]",
                  line.kind === "del" && "bg-rose-500/[0.10]",
                )}
              >
                <td className="w-9 select-none px-1.5 text-right align-top text-muted-foreground/40">
                  {line.oldNo ?? ""}
                </td>
                <td className="w-9 select-none px-1.5 text-right align-top text-muted-foreground/40">
                  {line.newNo ?? ""}
                </td>
                <td
                  className={cn(
                    "whitespace-pre pr-4 pl-1",
                    line.kind === "add" && "text-emerald-700 dark:text-emerald-200",
                    line.kind === "del" && "text-rose-700 dark:text-rose-300",
                    line.kind === "ctx" && "text-foreground/75",
                  )}
                >
                  <span className="mr-1.5 select-none opacity-50">
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                  </span>
                  {line.text}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {lines.length > MAX_LINES && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-3 my-2 cursor-pointer text-caption text-purple-500 hover:underline"
        >
          Show {lines.length - MAX_LINES} more lines
        </button>
      ) : null}
    </div>
  );
}

type SplitRow =
  | { kind: "hunk"; text: string }
  | { kind: "pair"; left: Extract<DiffLine, { oldNo: number | null }> | null; right: Extract<DiffLine, { oldNo: number | null }> | null };

/** Side by side: removed lines on the left, added on the right, paired up. */
function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let dels: Extract<DiffLine, { oldNo: number | null }>[] = [];
  let adds: Extract<DiffLine, { oldNo: number | null }>[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i += 1) {
      rows.push({ kind: "pair", left: dels[i] ?? null, right: adds[i] ?? null });
    }
    dels = [];
    adds = [];
  };
  for (const line of lines) {
    if (line.kind === "hunk") {
      flush();
      rows.push(line);
    } else if (line.kind === "del") dels.push(line);
    else if (line.kind === "add") adds.push(line);
    else {
      flush();
      rows.push({ kind: "pair", left: line, right: line });
    }
  }
  flush();
  return rows;
}

function SplitDiffView({ diff }: { diff: string }) {
  const [showAll, setShowAll] = useState(false);
  const { lines, binary } = parseDiff(diff);
  if (binary) return <p className="px-4 pb-2 text-caption text-muted-foreground">Binary file changed.</p>;
  if (lines.length === 0) return <p className="px-4 pb-2 text-caption text-muted-foreground">No text changes.</p>;
  const rows = toSplitRows(lines);
  const visible = showAll ? rows : rows.slice(0, MAX_LINES);

  const cell = (line: Extract<DiffLine, { oldNo: number | null }> | null, side: "left" | "right") => {
    const no = line ? (side === "left" ? line.oldNo : line.newNo) : null;
    const tone = line?.kind === "del" ? "del" : line?.kind === "add" ? "add" : line ? "ctx" : "empty";
    return (
      <>
        <td
          className={cn(
            "w-9 select-none px-1.5 text-right align-top text-muted-foreground/40",
            tone === "del" && "bg-rose-500/[0.10]",
            tone === "add" && "bg-emerald-500/[0.10]",
            tone === "empty" && "bg-black/[0.02] dark:bg-white/[0.02]",
          )}
        >
          {no ?? ""}
        </td>
        <td
          className={cn(
            "w-1/2 whitespace-pre-wrap break-all pr-3 pl-1 align-top",
            side === "left" && "border-r border-black/[0.05] dark:border-white/[0.05]",
            tone === "del" && "bg-rose-500/[0.10] text-rose-700 dark:text-rose-300",
            tone === "add" && "bg-emerald-500/[0.10] text-emerald-700 dark:text-emerald-200",
            tone === "ctx" && "text-foreground/75",
            tone === "empty" && "bg-black/[0.02] dark:bg-white/[0.02]",
          )}
        >
          {line?.text ?? ""}
        </td>
      </>
    );
  };

  return (
    <div className="pb-1 font-mono text-label leading-[1.55]">
      <table className="w-full table-fixed border-collapse">
        <tbody>
          {visible.map((row, index) =>
            row.kind === "hunk" ? (
              <tr key={index} className="bg-purple-500/[0.06] text-muted-foreground/70">
                <td colSpan={4} className="px-3 py-0.5 text-caption">
                  ⋯ {row.text}
                </td>
              </tr>
            ) : (
              <tr key={index}>
                {cell(row.left, "left")}
                {cell(row.right, "right")}
              </tr>
            ),
          )}
        </tbody>
      </table>
      {rows.length > MAX_LINES && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-3 my-2 cursor-pointer text-caption text-purple-500 hover:underline"
        >
          Show {rows.length - MAX_LINES} more lines
        </button>
      ) : null}
    </div>
  );
}
