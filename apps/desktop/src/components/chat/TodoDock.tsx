// The agent's plan, docked right above the chat input (like Claude): always
// in view while it works, collapsed to one line once everything is done.

import { CheckCircle2, ChevronDown, ListChecks, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { KodeTodo } from "@/lib/kode-tools";
import { TodoList } from "./TodoList";
import { cn } from "@/lib/utils";

export function TodoDock({ todos, running, planKey, compact = false }: { todos: KodeTodo[]; running: boolean; planKey: string; /** A question or approval is waiting: stay on one line. */ compact?: boolean }) {
  const done = todos.filter((todo) => todo.status === "completed").length;
  const finished = done === todos.length || todos.every((t) => t.status === "completed" || t.status === "cancelled");
  const current = todos.find((todo) => todo.status === "in_progress") ?? todos.find((todo) => todo.status === "pending");
  const [open, setOpen] = useState(!finished);
  const [hidden, setHidden] = useState(false);
  // A new plan (or new run) shows again and opens while work is going on.
  useEffect(() => {
    setHidden(false);
  }, [planKey]);
  useEffect(() => {
    setOpen(running && !finished);
  }, [running, finished]);
  if (todos.length === 0 || hidden) return null;
  return (
    <div className="liquid-glass-dropdown pointer-events-auto mx-auto mb-2 w-full overflow-hidden !rounded-[18px] text-foreground">
      <div className="flex items-center gap-2 px-3.5 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          {running && !finished ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-purple-500" />
          ) : finished ? (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
          ) : (
            <ListChecks size={14} className="shrink-0 text-purple-500" />
          )}
          <span className="shrink-0 text-[12.5px] font-medium">{finished ? "Plan done" : "Plan"}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {done} of {todos.length}
          </span>
          {(!open || compact) && current && !finished ? <span className="min-w-0 truncate text-[12px] text-foreground/70">· {current.title}</span> : null}
          <ChevronDown size={13} className={cn("ml-auto shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {!running ? (
          <button type="button" onClick={() => setHidden(true)} aria-label="Hide plan" title="Hide plan" className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        ) : null}
      </div>
      {open && !compact ? (
        <div className="max-h-52 overflow-y-auto border-t border-black/[0.06] px-3.5 pt-2.5 pb-1 dark:border-white/[0.06]">
          <TodoList todos={todos} hideCount running={running} />
        </div>
      ) : null}
    </div>
  );
}
