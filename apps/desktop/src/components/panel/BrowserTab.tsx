import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

const COMMON_PORTS = [3000, 3001, 5173, 4321, 8080, 8000];

// "3000" / ":3000" → localhost; bare hosts get http for localhost, https otherwise.
function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^:?\d{2,5}$/.test(value)) return `http://localhost:${value.replace(":", "")}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(value)) return `http://${value}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) return `https://${value}`;
  return null;
}

export function BrowserTab() {
  const [history, setHistory] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [draft, setDraft] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const current = index >= 0 ? history[index] : null;

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
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    setIndex(nextIndex);
    setDraft(history[nextIndex]);
  };

  const navButton =
    "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-white/[0.05]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        <button
          type="button"
          aria-label="Reload"
          disabled={!current}
          onClick={() => setReloadKey((k) => k + 1)}
          className={navButton}
        >
          <RotateCw size={12} />
        </button>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          placeholder="localhost:3000 or a URL"
          spellCheck={false}
          className={cn(
            "kontinue-3d mx-1 h-8 min-w-0 flex-1 rounded-full px-3.5 text-[12px] outline-none placeholder:text-muted-foreground/60",
            invalid && "ring-1 ring-rose-500/50",
          )}
        />
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
      </form>

      <div className="relative min-h-0 flex-1 border-t border-black/[0.05] dark:border-white/[0.05]">
        {current ? (
          <iframe
            key={`${current}#${reloadKey}`}
            src={current}
            title="Preview"
            className="h-full w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <Globe size={22} strokeWidth={1.4} className="text-muted-foreground/60" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Preview a dev server or any page. Some sites block being shown
              inside apps; open those in your browser.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {COMMON_PORTS.map((port) => (
                <button
                  key={port}
                  type="button"
                  onClick={() => navigate(String(port))}
                  className="kontinue-3d cursor-pointer rounded-full px-3 py-1 font-mono text-[11px] text-foreground/75 hover:text-foreground"
                >
                  :{port}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
