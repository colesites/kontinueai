// ⌘P: jump to any project file by typing part of its name or path.

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { File, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const cache = new Map<string, { at: number; files: string[] }>();
const CACHE_MS = 20_000;
const LIMIT = 60;

/** Subsequence match; higher is better, null when it doesn't match. */
export function scorePath(path: string, query: string): number | null {
  if (!query) return 0;
  const lowerPath = path.toLowerCase();
  const name = lowerPath.slice(lowerPath.lastIndexOf("/") + 1);
  const q = query.toLowerCase().replace(/\s+/g, "");
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of q) {
    const index = lowerPath.indexOf(char, from);
    if (index === -1) return null;
    if (index === previous + 1) score += 5; // consecutive
    const before = lowerPath[index - 1];
    if (index === 0 || before === "/" || before === "." || before === "-" || before === "_") score += 4; // word start
    score -= Math.min(index - from, 10) * 0.1;
    previous = index;
    from = index + 1;
  }
  if (name.includes(q)) score += 20 + (name.startsWith(q) ? 10 : 0);
  return score - path.length * 0.01;
}

export function QuickOpen({ root, onPick, onClose }: { root: string; onPick: (path: string) => void; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(() => cache.get(root)?.files ?? null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = cache.get(root);
    if (cached && Date.now() - cached.at < CACHE_MS) return;
    let cancelled = false;
    invoke<string[]>("kode_list_project_files", { root })
      .then((list) => {
        cache.set(root, { at: Date.now(), files: list });
        if (!cancelled) setFiles(list);
      })
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, [root]);

  const results = useMemo(() => {
    if (!files) return [];
    const q = query.trim();
    if (!q) return files.slice(0, LIMIT);
    const scored: Array<[string, number]> = [];
    for (const path of files) {
      const score = scorePath(path, q);
      if (score !== null) scored.push([path, score]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, LIMIT).map(([path]) => path);
  }, [files, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="absolute inset-0 z-40 flex justify-center bg-black/10 pt-12 dark:bg-black/30" onMouseDown={onClose}>
      <div
        className="liquid-glass-dropdown flex h-fit max-h-[60%] w-[min(32rem,calc(100%-2rem))] flex-col overflow-hidden p-1.5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 px-2.5">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Go to file"
            aria-label="Go to file"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const pick = results[active];
                if (pick) onPick(pick);
              }
            }}
            className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div ref={listRef} className="min-h-0 overflow-y-auto">
          {files === null ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-label text-muted-foreground">No matching files</p>
          ) : (
            results.map((path, index) => {
              const slash = path.lastIndexOf("/");
              return (
                <button
                  key={path}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(path)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left",
                    index === active ? "bg-black/[0.06] dark:bg-white/[0.08]" : "",
                  )}
                >
                  <File size={12} className="shrink-0 text-muted-foreground" />
                  <span className="shrink-0 text-body text-foreground">{path.slice(slash + 1)}</span>
                  <span className="min-w-0 truncate font-mono text-caption text-muted-foreground">{slash > 0 ? path.slice(0, slash) : ""}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
