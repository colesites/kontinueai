import { useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { envVarsFor } from "@/lib/kode-environments";
import {
  errorText,
  killTerminal,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "./panel-api";

type Session = { key: number; title: string; cwd: string };

const DARK_THEME: ITheme = {
  background: "#050506",
  foreground: "#e4e4e7",
  cursor: "#c084fc",
  cursorAccent: "#050506",
  selectionBackground: "rgba(168, 85, 247, 0.35)",
  black: "#18181b",
  brightBlack: "#52525b",
  red: "#f87171",
  brightRed: "#fca5a5",
  green: "#4ade80",
  brightGreen: "#86efac",
  yellow: "#facc15",
  brightYellow: "#fde047",
  blue: "#60a5fa",
  brightBlue: "#93c5fd",
  magenta: "#c084fc",
  brightMagenta: "#d8b4fe",
  cyan: "#22d3ee",
  brightCyan: "#67e8f9",
  white: "#d4d4d8",
  brightWhite: "#fafafa",
};

const LIGHT_THEME: ITheme = {
  background: "#fbfaff",
  foreground: "#27272a",
  cursor: "#9333ea",
  cursorAccent: "#fbfaff",
  selectionBackground: "rgba(147, 51, 234, 0.2)",
  black: "#27272a",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#71717a",
};

const isDark = () => document.documentElement.classList.contains("dark");

export function TerminalTab({ projectPath, visible }: { projectPath: string; visible: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const nextKey = useRef(1);

  const addSession = () => {
    const key = nextKey.current++;
    setSessions((current) => [...current, { key, title: `Terminal ${key}`, cwd: projectPath }]);
    setActiveKey(key);
  };

  const closeSession = (key: number) => {
    setSessions((current) => {
      const next = current.filter((s) => s.key !== key);
      if (activeKey === key) setActiveKey(next[next.length - 1]?.key ?? null);
      return next;
    });
  };

  // Open the first terminal the first time the tab is shown.
  useEffect(() => {
    if (visible && sessions.length === 0) addSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto px-2">
        {sessions.map((session) => (
          <div
            key={session.key}
            className={cn(
              "group flex h-7 shrink-0 items-center gap-1 rounded-full pr-1 pl-3 text-label transition-colors",
              session.key === activeKey
                ? "kontinue-menu-active"
                : "text-muted-foreground kontinue-hover",
            )}
          >
            <button type="button" className="cursor-pointer" onClick={() => setActiveKey(session.key)}>
              {session.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${session.title}`}
              onClick={() => closeSession(session.key)}
              className="flex size-5 cursor-pointer items-center justify-center rounded-full opacity-60 hover:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          title="New terminal"
          aria-label="New terminal"
          onClick={addSession}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button
              type="button"
              onClick={addSession}
              className="kontinue-3d cursor-pointer rounded-full px-4 py-1.5 text-xs text-foreground/80"
            >
              New terminal
            </button>
          </div>
        ) : null}
        {sessions.map((session) => (
          <TerminalView
            key={session.key}
            cwd={session.cwd}
            visible={visible && session.key === activeKey}
            onTitle={(title) =>
              setSessions((current) =>
                current.map((s) => (s.key === session.key ? { ...s, title } : s)),
              )
            }
            onExit={() => closeSession(session.key)}
          />
        ))}
      </div>
    </div>
  );
}

function TerminalView({
  cwd,
  visible,
  onTitle,
  onExit,
}: {
  cwd: string;
  visible: boolean;
  onTitle: (title: string) => void;
  onExit: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ onTitle, onExit });
  callbacks.current = { onTitle, onExit };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      fontFamily: '"SF Mono", Menlo, Monaco, "JetBrains Mono", monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: isDark() ? DARK_THEME : LIGHT_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {
      // Not laid out yet; the resize observer will fit it.
    }

    let disposed = false;
    spawnTerminal({
      cwd,
      env: envVarsFor(cwd),
      cols: term.cols,
      rows: term.rows,
      onData: (data) => term.write(data),
      onExit: () => !disposed && callbacks.current.onExit(),
    })
      .then((id) => {
        if (disposed) {
          void killTerminal(id);
          return;
        }
        ptyRef.current = id;
      })
      .catch((err) => setError(errorText(err)));

    const input = term.onData((data) => {
      if (ptyRef.current !== null) void writeTerminal(ptyRef.current, data);
    });
    const title = term.onTitleChange((value) => value && callbacks.current.onTitle(value.slice(0, 32)));
    const resize = term.onResize(({ cols, rows }) => {
      if (ptyRef.current !== null) void resizeTerminal(ptyRef.current, cols, rows);
    });

    const observer = new ResizeObserver(() => {
      if (host.offsetWidth > 0 && host.offsetHeight > 0) {
        try {
          fit.fit();
        } catch {
          // ignore transient layout states
        }
      }
    });
    observer.observe(host);

    // Follow light/dark theme switches.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = isDark() ? DARK_THEME : LIGHT_THEME;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      disposed = true;
      observer.disconnect();
      themeObserver.disconnect();
      input.dispose();
      title.dispose();
      resize.dispose();
      if (ptyRef.current !== null) void killTerminal(ptyRef.current);
      term.dispose();
    };
  }, [cwd]);

  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // ignore
      }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  return (
    <div className={cn("absolute inset-0 px-3 pt-1 pb-2", !visible && "invisible")}>
      {error ? <p className="py-2 text-label text-rose-400">{error}</p> : null}
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
