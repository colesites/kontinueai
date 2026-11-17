// Right panel → Environment: the sub-agents this chat started, live (like
// T3 Code's lineage list). One row per agent: logo, name, status, elapsed.

import { Bot, Square } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { fanOutItems } from "@/components/chat/FanOutGroup";
import { stopFanOutRun, useFanOuts } from "@/lib/kode-fanout";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

const TONE = {
  queued: "text-muted-foreground",
  working: "text-brand",
  done: "text-success",
  error: "text-danger",
  stopped: "text-muted-foreground",
} as const;

function elapsed(from: number, to: number) {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}

export function SubagentsSection({
  Section,
  Divider,
}: {
  Section: (props: { title: string; children: ReactNode }) => ReactNode;
  Divider: () => ReactNode;
}) {
  const { activeChatId, selectChat } = useKodeWorkspace();
  const fanOuts = useFanOuts().filter((f) => f.parentChatId && f.parentChatId === activeChatId);
  const runs = fanOuts.flatMap((f) => f.runs);
  const working = runs.filter((r) => r.status === "running" || r.status === "starting" || r.status === "queued").length;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [working]);

  if (runs.length === 0) return null;
  const items = fanOuts.flatMap((f) => fanOutItems(f, selectChat));

  return (
    <>
      <Divider />
      <Section title={working ? `Sub-agents · ${working} running` : "Sub-agents"}>
        {items.map((item, index) => {
          const run = runs[index];
          return (
            <div key={item.key} className="group flex min-w-0 items-center gap-2 py-1">
              <button
                type="button"
                disabled={!item.onOpen}
                onClick={item.onOpen}
                title={item.onOpen ? "Open its chat" : undefined}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {item.icon ?? <Bot size={12} className="text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-label text-foreground/90">{item.label}</span>
                <span className={cn("shrink-0 text-caption", TONE[item.status])}>
                  {item.status === "working" ? "Working" : item.status === "queued" ? "Queued" : item.status === "error" ? "Failed" : item.status === "stopped" ? "Stopped" : "Done"}
                </span>
                <span className="w-8 shrink-0 text-right text-caption tabular-nums text-muted-foreground">
                  {run.status === "queued" ? "" : elapsed(run.startedAt, run.finishedAt ?? now)}
                </span>
              </button>
              {item.status === "working" || item.status === "queued" ? (
                <button
                  type="button"
                  aria-label={`Stop ${item.label}`}
                  title="Stop"
                  onClick={() => stopFanOutRun(run.id)}
                  className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground kontinue-hover hover:text-foreground"
                >
                  <Square size={10} />
                </button>
              ) : null}
            </div>
          );
        })}
      </Section>
    </>
  );
}
