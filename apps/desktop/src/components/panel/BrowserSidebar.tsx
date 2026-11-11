import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrowserTab } from "./BrowserTab";

type SideTab = { id: string; url: string | null };

function createId() {
  return `browser-side-${crypto.randomUUID()}`;
}

function tabTitle(url: string | null) {
  if (!url) return "New tab";
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/search") {
      const query = parsed.searchParams.get("q");
      if (query) return query;
    }
    return parsed.hostname.replace(/^www\./, "") || "New tab";
  } catch {
    return "New tab";
  }
}

export function BrowserSidebar({
  active,
  onOpenInTab,
}: {
  active: boolean;
  onOpenInTab?: (url: string | null) => void;
}) {
  const [tabs, setTabs] = useState<SideTab[]>(() => [{ id: createId(), url: null }]);
  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? "");

  const addTab = () => {
    const id = createId();
    setTabs((current) => [...current, { id, url: null }]);
    setActiveId(id);
  };

  const closeTab = (id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    if (remaining.length === 0) {
      const fresh = { id: createId(), url: null };
      setTabs([fresh]);
      setActiveId(fresh.id);
      return;
    }
    if (activeId === id) {
      setActiveId(remaining[Math.min(index, remaining.length - 1)].id);
    }
    setTabs(remaining);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-px py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const title = tabTitle(tab.url);
            const selected = tab.id === activeId;
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex h-7 min-w-0 max-w-[9.5rem] shrink-0 items-center rounded-md border pl-2 pr-0.5 text-label",
                  selected
                    ? "border-black/10 bg-black/[0.05] text-foreground dark:border-white/15 dark:bg-white/[0.08]"
                    : "border-transparent text-muted-foreground kontinue-hover hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(tab.id)}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left"
                  title={title}
                >
                  {title}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${title}`}
                  onClick={() => closeTab(tab.id)}
                  className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="New tab"
          title="New tab"
          onClick={addTab}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground kontinue-hover hover:text-foreground"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0 flex flex-col",
              tab.id !== activeId && "invisible pointer-events-none",
            )}
          >
            <BrowserTab
              label={tab.id}
              active={active && tab.id === activeId}
              initialUrl={tab.url}
              systemBrowser={false}
              onOpenInTab={onOpenInTab}
              onUrlChange={(url) =>
                setTabs((current) => {
                  const item = current.find((entry) => entry.id === tab.id);
                  if (!item || item.url === url) return current;
                  return current.map((entry) => (entry.id === tab.id ? { ...entry, url } : entry));
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
