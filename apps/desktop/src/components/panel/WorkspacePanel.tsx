import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FileDiff,
  FolderTree,
  Globe,
  SquareTerminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EnvironmentTab } from "./EnvironmentTab";
import { ChangesTab } from "./ChangesTab";
import { TerminalTab } from "./TerminalTab";
import { FilesTab } from "./FilesTab";
import { BrowserSidebar } from "./BrowserSidebar";
import { useGitStatus } from "./use-git-status";

export type PanelTab = "environment" | "changes" | "terminal" | "files" | "browser";

/** Rounded square with two bullet rows (like Claude Code's environment icon). */
function EnvironmentIcon({ size = 14, strokeWidth = 1.6 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <title>Environment</title>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.25" cy="9.5" r="0.6" fill="currentColor" />
      <circle cx="8.25" cy="14.5" r="0.6" fill="currentColor" />
      <path d="M11 9.5h5.5M11 14.5h5.5" />
    </svg>
  );
}

type TabIcon = (props: { size?: number; strokeWidth?: number }) => React.ReactNode;

const TABS: { id: PanelTab; label: string; icon: TabIcon }[] = [
  { id: "environment", label: "Environment", icon: EnvironmentIcon },
  { id: "changes", label: "Changes", icon: FileDiff },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "browser", label: "Browser", icon: Globe },
];

const WIDTH_KEY = "kontinue.panel.width";
const TAB_KEY = "kontinue.panel.tab";
const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 420;

function readStored<T>(key: string, fallback: T, parse: (raw: string) => T | null): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (parse(raw) ?? fallback);
  } catch {
    return fallback;
  }
}

export type WorkspacePanelProps = {
  open: boolean;
  onClose: () => void;
  projectName: string | null;
  projectPath: string | null;
  /** Lets other UI (e.g. Overview) jump to a tab. */
  requestedTab?: PanelTab | null;
  onOpenFilesTab?: (path?: string | null) => void;
  onOpenBrowserTab?: (url: string | null) => void;
};

// The right-hand workspace panel. Same material as the left sidebar, docked to
// the window edge. Stays mounted while closed so terminals keep running.
export function WorkspacePanel({
  open,
  onClose,
  projectName,
  projectPath,
  requestedTab,
  onOpenFilesTab,
  onOpenBrowserTab,
}: WorkspacePanelProps) {
  const [width, setWidth] = useState(() =>
    readStored(WIDTH_KEY, DEFAULT_WIDTH, (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n)) : null;
    }),
  );
  const [tab, setTab] = useState<PanelTab>(() =>
    readStored<PanelTab>(TAB_KEY, "environment", (raw) =>
      TABS.some((t) => t.id === raw) ? (raw as PanelTab) : null,
    ),
  );
  const [resizing, setResizing] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // Storage unavailable: the tab just isn't remembered.
    }
  }, [tab]);

  const git = useGitStatus(
    projectPath,
    open && (tab === "environment" || tab === "changes"),
  );

  const asideRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Resize by writing styles directly (once per frame) and save the width on
  // release, so terminals and tabs don't re-render while dragging.
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let next = startWidth;
    setResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + startX - ev.clientX));
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (asideRef.current) asideRef.current.style.width = `${next}px`;
        if (innerRef.current) innerRef.current.style.width = `${next}px`;
      });
    };
    const onUp = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidth(next);
      setResizing(false);
      try {
        localStorage.setItem(WIDTH_KEY, String(next));
      } catch {
        // ignore
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resizeBy = (delta: number) => {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width + delta));
    setWidth(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // The width still applies for this session.
    }
  };

  const onResizeKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeBy(16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeBy(-16);
    }
  };

  const changeCount = git.status?.files.length ?? 0;

  return (
    <aside
      ref={asideRef}
      aria-hidden={!open}
      className={cn(
        "relative h-full shrink-0 overflow-hidden",
        !resizing && "transition-[width] duration-300 ease-in-out",
      )}
      style={{ width: open ? width : 0 }}
    >
      <div
        ref={innerRef}
        className="liquid-glass-sidebar !border-r-0 flex h-full border-l border-white/60 dark:border-white/[0.06]"
        style={{ width }}
      >
        {/* In the layout, not over the page. A child webview paints above HTML
            and would swallow clicks on an overlaid handle. */}
        <hr
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
          onPointerDown={startResize}
          onKeyDown={onResizeKey}
          className="relative z-20 m-0 h-full w-2 shrink-0 cursor-ew-resize border-0 border-l border-transparent bg-transparent outline-none hover:border-purple-500/50 focus-visible:border-purple-500/50"
        />
        <div className="flex min-w-0 flex-1 flex-col">
        {/* Header: tab icons + close */}
        <div
          data-tauri-drag-region
          className="flex h-11 shrink-0 items-center gap-0.5 px-2"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "relative flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors",
                tab === id
                  ? "kontinue-menu-active"
                  : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
              )}
            >
              <Icon size={14} strokeWidth={1.6} />
              {id === "changes" && changeCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-purple-500" />
              ) : null}
            </button>
          ))}
          <span className="ml-2 truncate text-[12px] font-medium text-foreground/70">
            {TABS.find((t) => t.id === tab)?.label}
          </span>
          <button
            type="button"
            title="Close panel"
            aria-label="Close panel"
            onClick={onClose}
            className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 border-t border-black/[0.05] dark:border-white/[0.05]">
          {!projectPath && tab !== "browser" ? (
            <EmptyState>
              Open a project folder in Kode to see its overview, changes,
              terminal and files.
            </EmptyState>
          ) : null}

          {projectPath ? (
            <>
              <TabPane active={tab === "environment"}>
                <EnvironmentTab
                  projectName={projectName}
                  projectPath={projectPath}
                  git={git}
                  onOpenTab={setTab}
                />
              </TabPane>
              <TabPane active={tab === "changes"}>
                <ChangesTab projectPath={projectPath} git={git} />
              </TabPane>
              {/* Terminals stay mounted so shells keep running across tabs. */}
              <TabPane active={tab === "terminal"}>
                <TerminalTab projectPath={projectPath} visible={open && tab === "terminal"} />
              </TabPane>
              <TabPane active={tab === "files"}>
                <FilesTab
                  projectPath={projectPath}
                  active={open && tab === "files"}
                  onOpenInTab={onOpenFilesTab}
                />
              </TabPane>
            </>
          ) : null}
          <TabPane active={tab === "browser"}>
            <BrowserSidebar active={open && tab === "browser"} onOpenInTab={onOpenBrowserTab} />
          </TabPane>
        </div>
        </div>
      </div>
    </aside>
  );
}

function TabPane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={cn("absolute inset-0 flex flex-col", !active && "invisible")}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center text-[12px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}
