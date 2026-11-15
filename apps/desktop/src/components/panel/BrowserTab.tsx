import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, MousePointerClick, RotateCw, X } from "lucide-react";
import { addAnnotation } from "@/lib/kode-annotations";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

/** What the in-page picker reports (src-tauri/src/browser_view.rs). */
type PickedElement = { url: string; selector: string; label: string; html: string };

const COMMON_PORTS = [3000, 3001, 5173, 4321, 8080, 8000];
const IN_APP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const TRACKING_HOST =
  /(?:^|\.)(?:gstatic|doubleclick|googleadservices|googlesyndication|google-analytics)\.com$/i;
const closing = new Map<string, number>();

function useAppDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// A port or a host opens that page. Anything else is a web search.
function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^:?\d{2,5}$/.test(value)) return `http://localhost:${value.replace(":", "")}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

// The plain-browser fallback is an iframe, which can only show Google's embed.
function iframeSrc(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("google.com") && parsed.pathname === "/search" && !parsed.searchParams.has("igu")) {
      parsed.searchParams.set("igu", "1");
      return parsed.toString();
    }
  } catch {
    // Keep the original string.
  }
  return url;
}

function samePage(left: string | undefined, right: string): boolean {
  if (!left) return false;
  try {
    const a = new URL(left);
    const b = new URL(right);
    if (a.origin !== b.origin || a.pathname !== b.pathname) return false;
    const aq = a.searchParams.get("q");
    const bq = b.searchParams.get("q");
    if (aq !== null || bq !== null) return aq === bq;
    return a.href === b.href;
  } catch {
    return left === right;
  }
}

function trackable(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !TRACKING_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Could not open the page.";
}

export function BrowserTab({
  initialUrl = null,
  onOpenInTab,
  onUrlChange,
  label = "browser-panel",
  active: activeProp = true,
  systemBrowser = true,
}: {
  initialUrl?: string | null;
  onOpenInTab?: (url: string | null) => void;
  onUrlChange?: (url: string | null) => void;
  label?: string;
  active?: boolean;
  /** System-browser button. The sidebar uses the web icon for a full tab instead. */
  systemBrowser?: boolean;
}) {
  // The page is a native view drawn above the app's HTML, so anything that
  // covers it (Settings) has to hide it rather than paint over it.
  const { isSettingsOpen } = useKodeWorkspace();
  const active = activeProp && !isSettingsOpen;
  const [history, setHistory] = useState<string[]>(() => (initialUrl ? [initialUrl] : []));
  const [index, setIndex] = useState(() => (initialUrl ? 0 : -1));
  const [draft, setDraft] = useState(initialUrl ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const dark = useAppDark();
  const current = index >= 0 ? history[index] : null;
  const hostRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(current);
  const historyRef = useRef(history);
  const indexRef = useRef(index);
  const visibleRef = useRef(false);
  const loadedRef = useRef<string | null>(null);
  const seenDark = useRef(dark);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useRef((task: () => Promise<void>) => {
    queue.current = queue.current.then(task, task);
  }).current;
  currentRef.current = current;
  historyRef.current = history;
  indexRef.current = index;
  visibleRef.current = active && current !== null;

  useEffect(() => {
    onUrlChange?.(current);
  }, [current, onUrlChange]);

  // Annotate: pick an element in the page, write a note, send it with the next message.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [pickNote, setPickNote] = useState("");
  const togglePicker = () => {
    const next = !picking;
    setPicking(next);
    void invoke("browser_annotate", { label, active: next }).catch(() => setPicking(false));
  };
  useEffect(() => {
    if (!IN_APP) return;
    let unlisten: (() => void) | undefined;
    void listen<{ label: string; data: string | null }>("browser-annotation", (event) => {
      if (event.payload.label !== label) return;
      setPicking(false);
      try {
        const data = event.payload.data ? (JSON.parse(event.payload.data) as PickedElement) : null;
        if (data?.selector) {
          setPicked(data);
          setPickNote("");
        }
      } catch {
        // Unreadable pick: ignore.
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [label]);
  const savePick = () => {
    if (!picked) return;
    addAnnotation({ kind: "element", ...picked, note: pickNote.trim() });
    setPicked(null);
    setPickNote("");
  };

  useEffect(() => {
    if (!IN_APP) return;
    let unlisten: (() => void) | undefined;
    void listen<{ label: string; url: string }>("browser-navigated", (event) => {
      if (event.payload.label !== label || !trackable(event.payload.url)) return;
      const url = event.payload.url;
      loadedRef.current = url;
      const pages = historyRef.current;
      const at = indexRef.current;
      if (samePage(pages[at], url)) {
        if (pages[at] !== url) {
          const next = pages.slice();
          next[at] = url;
          setHistory(next);
        }
        setDraft(url);
        return;
      }
      if (samePage(pages[at - 1], url)) {
        setIndex(at - 1);
        setDraft(url);
        return;
      }
      if (samePage(pages[at + 1], url)) {
        setIndex(at + 1);
        setDraft(url);
        return;
      }
      const next = [...pages.slice(0, at + 1), url];
      setHistory(next);
      setIndex(next.length - 1);
      setDraft(url);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [label]);

  useEffect(() => {
    if (!IN_APP) return;
    let cancelled = false;
    let attempts = 0;
    const tick = () => {
      if (cancelled || !visibleRef.current) return;
      const node = hostRef.current;
      const url = currentRef.current;
      if (!node || !url) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        if (attempts++ < 20) requestAnimationFrame(tick);
        return;
      }
      attempts = 0;
      const navigate = loadedRef.current !== url;
      const restyle = seenDark.current !== dark;
      seenDark.current = dark;
      loadedRef.current = url;
      const bounds = {
        label,
        url,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        navigate,
        dark,
      };
      enqueue(async () => {
        try {
          await invoke("browser_place", bounds);
          if (restyle) await invoke("browser_reload", { label, dark });
          if (!cancelled) setNativeError(null);
        } catch (error) {
          if (navigate) loadedRef.current = null;
          if (!cancelled) setNativeError(errorText(error));
        }
        if (!visibleRef.current) await invoke("browser_hide", { label }).catch(() => {});
      });
    };
    if (active && current) tick();
    const observer = new ResizeObserver(() => tick());
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener("resize", tick);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", tick);
    };
  }, [active, current, dark, enqueue, label]);

  useEffect(() => {
    if (!IN_APP || (active && current)) return;
    enqueue(async () => {
      await invoke("browser_hide", { label }).catch(() => {});
    });
  }, [active, current, enqueue, label]);

  useEffect(() => {
    const name = label;
    const pending = closing.get(name);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      closing.delete(name);
    }
    return () => {
      if (!IN_APP) return;
      // Defer so React's dev remount can cancel the close and keep the page.
      const timer = window.setTimeout(() => {
        closing.delete(name);
        void invoke("browser_hide", { label: name }).catch(() => {});
        void invoke("browser_close", { label: name }).catch(() => {});
      }, 0);
      closing.set(name, timer);
    };
  }, [label]);

  const navigate = (input: string) => {
    const url = normalizeUrl(input);
    if (!url) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const next = [...history.slice(0, index + 1), url];
    setHistory(next);
    setIndex(next.length - 1);
    setDraft(url);
  };

  const go = (delta: number) => {
    if (IN_APP && current) {
      void invoke("browser_go", { label, back: delta < 0 }).catch(() => {});
      return;
    }
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    setIndex(nextIndex);
    setDraft(history[nextIndex]);
  };

  const reload = () => {
    if (IN_APP && current) {
      void invoke("browser_reload", { label, dark }).catch(() => {});
      return;
    }
    setReloadKey((key) => key + 1);
  };

  const navButton =
    "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {picked ? (
        <form
          className="flex shrink-0 items-center gap-1.5 px-2 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            savePick();
          }}
        >
          <MousePointerClick size={13} className="ml-1.5 shrink-0 text-purple-500" />
          <input
            autoFocus
            value={pickNote}
            onChange={(e) => setPickNote(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setPicked(null)}
            placeholder={`Note on ${picked.label.slice(0, 40)}`}
            className="kontinue-3d h-8 min-w-0 flex-1 rounded-full px-3.5 text-label outline-none placeholder:text-muted-foreground/60"
          />
          <button type="submit" className="kontinue-3d-primary h-8 shrink-0 cursor-pointer rounded-full px-3 text-label font-medium">
            Add note
          </button>
          <button type="button" aria-label="Cancel" onClick={() => setPicked(null)} className={navButton}>
            <X size={13} />
          </button>
        </form>
      ) : (
      <form
        className="flex shrink-0 items-center gap-0.5 px-2 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(draft);
        }}
      >
        <button type="button" aria-label="Back" disabled={index <= 0} onClick={() => go(-1)} className={navButton}>
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={index >= history.length - 1}
          onClick={() => go(1)}
          className={navButton}
        >
          <ArrowRight size={13} />
        </button>
        <button type="button" aria-label="Reload" disabled={!current} onClick={reload} className={navButton}>
          <RotateCw size={12} />
        </button>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          placeholder="Search or enter a URL"
          spellCheck={false}
          className={cn(
            "kontinue-3d mx-1 h-8 min-w-0 flex-1 rounded-full px-3.5 text-label outline-none placeholder:text-muted-foreground/60",
            invalid && "ring-1 ring-rose-500/50",
          )}
        />
        {onOpenInTab ? (
          <button
            type="button"
            aria-label="Open in a full tab"
            title="Open in a full tab"
            onClick={() => onOpenInTab(current)}
            className={navButton}
          >
            <Globe size={12} />
          </button>
        ) : null}
        {systemBrowser ? (
          <button
            type="button"
            aria-label="Open in your browser"
            title="Open in your browser"
            disabled={!current}
            onClick={() => current && void openUrl(current).catch(() => window.open(current, "_blank"))}
            className={navButton}
          >
            <ExternalLink size={12} />
          </button>
        ) : null}
        {IN_APP ? (
          <button
            type="button"
            aria-label={picking ? "Stop picking" : "Annotate an element"}
            title={picking ? "Click an element in the page (Esc to cancel)" : "Annotate an element"}
            disabled={!current}
            onClick={togglePicker}
            className={cn(navButton, picking && "bg-purple-500/15 text-purple-500")}
          >
            <MousePointerClick size={12} />
          </button>
        ) : null}
      </form>
      )}

      <div className="relative min-h-0 flex-1 border-t border-black/[0.05] dark:border-white/[0.05]">
        <div ref={hostRef} className="absolute inset-0">
          {current && !IN_APP ? (
            <iframe
              key={`${current}#${reloadKey}#${dark ? "dark" : "light"}`}
              src={iframeSrc(current)}
              title="Preview"
              style={{ colorScheme: dark ? "dark" : "light" }}
              className={cn("h-full w-full", dark ? "bg-background" : "bg-white")}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
            />
          ) : current ? (
            <div className={cn("h-full w-full", dark ? "bg-background" : "bg-white")} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
              <Globe size={22} strokeWidth={1.4} className="text-muted-foreground/60" />
              <p className="text-label leading-relaxed text-muted-foreground">
                Search the web, open a URL, or preview a local server.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {COMMON_PORTS.map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => navigate(String(port))}
                    className="kontinue-3d cursor-pointer rounded-full px-3 py-1 font-mono text-caption text-foreground/75 hover:text-foreground"
                  >
                    :{port}
                  </button>
                ))}
              </div>
            </div>
          )}
          {nativeError ? (
            <p className="pointer-events-none absolute inset-x-4 bottom-3 text-center text-caption text-rose-500/80">
              {nativeError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
