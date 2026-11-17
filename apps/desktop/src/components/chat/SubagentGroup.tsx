// Several agents working for one turn, as one row: stacked logos,
// "4 sub-agents · 3 working", elapsed time. Expands to a row per agent with
// its status, latest output and actions. Used for Kode's own sub-agents
// (run_subagents) and for sub-agents a CLI agent runs inside its turn.

import { Bot, ChevronRight, ExternalLink, Square } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SubagentStatus = "queued" | "working" | "done" | "error" | "stopped";

export type SubagentItem = {
  key: string;
  label: string;
  /** Model logo; a generic agent icon when absent. */
  icon?: ReactNode;
  status: SubagentStatus;
  /** Latest output or error, one line. */
  detail?: string;
  /** "+12 −3" style change summary. */
  meta?: string;
  onOpen?: () => void;
  onStop?: () => void;
  /** The agent's own steps, shown when its row is expanded. */
  children?: ReactNode;
};

const STATUS_LABEL: Record<SubagentStatus, string> = {
  queued: "Queued",
  working: "Working",
  done: "Done",
  error: "Failed",
  stopped: "Stopped",
};

const STATUS_TONE: Record<SubagentStatus, string> = {
  queued: "text-muted-foreground",
  working: "text-brand",
  done: "text-success",
  error: "text-danger",
  stopped: "text-muted-foreground",
};

const MAX_STACKED = 3;

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** "3 working · 1 done", or "All done" when nothing else is left. */
function summary(items: SubagentItem[]) {
  const count = (status: SubagentStatus) => items.filter((item) => item.status === status).length;
  const working = count("working");
  const queued = count("queued");
  const failed = count("error");
  if (working + queued === 0) {
    if (failed === 0) return { text: "All done", tone: STATUS_TONE.done };
    return { text: `${failed} failed · ${items.length - failed} finished`, tone: STATUS_TONE.error };
  }
  const parts = [`${working} working`];
  if (queued) parts.push(`${queued} queued`);
  const finished = items.length - working - queued;
  if (finished) parts.push(`${finished} finished`);
  return { text: parts.join(" · "), tone: STATUS_TONE.working };
}

function AgentIcon({ item }: { item: SubagentItem }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background ring-2 ring-background">
      <span className="kontinue-3d flex size-6 items-center justify-center rounded-full">
        {item.icon ?? <Bot size={13} className="text-muted-foreground" />}
      </span>
    </span>
  );
}

export function SubagentGroup({ items, startedAt }: { items: SubagentItem[]; startedAt?: number }) {
  const [open, setOpen] = useState(false);
  const running = items.some((item) => item.status === "working" || item.status === "queued");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (items.length === 0) return null;
  const status = summary(items);
  const stacked = items.slice(0, MAX_STACKED);
  const extra = items.length - stacked.length;

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl py-1 text-left"
      >
        <span className="flex shrink-0 items-center">
          {stacked.map((item, index) => (
            <span key={item.key} className={cn(index > 0 && "-ml-2")}>
              <AgentIcon item={item} />
            </span>
          ))}
          {extra > 0 ? <span className="ml-1 text-caption text-muted-foreground">+{extra}</span> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-medium text-foreground/90">
            {items.length} sub-agent{items.length === 1 ? "" : "s"}
          </span>
          <span className={cn("block truncate text-caption", status.tone)}>{status.text}</span>
        </span>
        {startedAt ? (
          <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
            {formatElapsed((running ? now : Math.max(now, startedAt)) - startedAt)}
          </span>
        ) : null}
        <ChevronRight size={13} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5 border-l border-black/[0.06] pl-3 dark:border-white/[0.08]">
          {items.map((item) => (
            <SubagentRow key={item.key} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubagentRow({ item }: { item: SubagentItem }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(item.children);
  return (
    <div>
      <div className="group flex min-w-0 items-center gap-2 py-1">
        <button
          type="button"
          disabled={!expandable}
          onClick={() => setOpen((value) => !value)}
          className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", expandable && "cursor-pointer")}
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            {item.icon ?? <Bot size={12} className="text-muted-foreground" />}
          </span>
          <span className="shrink-0 truncate text-label text-foreground/90">{item.label}</span>
          <span className={cn("shrink-0 text-caption", STATUS_TONE[item.status])}>{STATUS_LABEL[item.status]}</span>
          {item.meta ? <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{item.meta}</span> : null}
          {item.detail ? <span className="min-w-0 truncate text-caption text-muted-foreground">{item.detail}</span> : null}
          {expandable ? (
            <ChevronRight size={11} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          ) : null}
        </button>
        {item.onStop && (item.status === "working" || item.status === "queued") ? (
          <button
            type="button"
            title="Stop this sub-agent"
            aria-label={`Stop ${item.label}`}
            onClick={item.onStop}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground kontinue-hover hover:text-foreground"
          >
            <Square size={10} />
          </button>
        ) : null}
        {item.onOpen ? (
          <button
            type="button"
            title="Open its chat"
            aria-label={`Open ${item.label}'s chat`}
            onClick={item.onOpen}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground kontinue-hover hover:text-foreground"
          >
            <ExternalLink size={11} />
          </button>
        ) : null}
      </div>
      {open && item.children ? <div className="ml-6 border-l border-black/[0.06] pl-3 dark:border-white/[0.08]">{item.children}</div> : null}
    </div>
  );
}
