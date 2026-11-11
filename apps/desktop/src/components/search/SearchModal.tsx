import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Pin, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatWhen } from "@/components/layout/sidebar/SidebarChatRow";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

type SearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MAX_RESULTS = 50;

/** Find a chat by title. ↑/↓ move, Enter opens, Esc closes. */
export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const { activeTab, setActiveTab, chats, projects, selectChat } = useKodeWorkspace();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inKode = activeTab === "kode";

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "";
    return chats
      .filter((chat) => !chat.archived)
      .map((chat) => ({ chat, project: projectName(chat.projectId) }))
      .filter(({ chat, project }) => {
        const hay = `${chat.title} ${project}`.toLowerCase();
        return words.every((word) => hay.includes(word));
      })
      .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt)
      .slice(0, MAX_RESULTS);
  }, [chats, projects, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart at the top for each query
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (chatId: string | undefined) => {
    if (!chatId) return;
    if (activeTab !== "home" && !inKode) setActiveTab("home");
    selectChat(chatId);
    onOpenChange(false);
  };

  const noun = inKode ? "threads" : "chats";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Search ${noun}`} size="lg" position="top" hideHeader className="max-h-[60vh]">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(results[index]?.chat.id);
              }
            }}
            placeholder={`Search ${noun} by title or project`}
            aria-label={`Search ${noun}`}
            className="w-full bg-transparent text-lead outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="kontinue-3d rounded-md px-1.5 text-caption text-muted-foreground">esc</kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-body text-muted-foreground">
              {query.trim() ? `No ${noun} match "${query.trim()}".` : `No ${noun} yet.`}
            </p>
          ) : (
            results.map(({ chat, project }, i) => (
              <button
                key={chat.id}
                type="button"
                data-index={i}
                onMouseMove={() => setIndex(i)}
                onClick={() => choose(chat.id)}
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left",
                  i === index && "bg-black/[0.05] dark:bg-white/[0.07]",
                )}
              >
                {chat.pinnedAt ? (
                  <Pin size={14} className="shrink-0 text-muted-foreground" fill="currentColor" />
                ) : (
                  <MessageSquare size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-body">{chat.title || "Untitled"}</span>
                {project ? <span className="max-w-[35%] truncate text-caption text-muted-foreground">{project}</span> : null}
                <span className="w-8 shrink-0 text-right text-caption tabular-nums text-muted-foreground/80">
                  {formatWhen(chat.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
