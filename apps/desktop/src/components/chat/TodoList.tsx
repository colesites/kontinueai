import { Check, Loader2, Minus } from "lucide-react";
import type { KodeTodo } from "@/lib/kode-tools";

function StatusMark({ status, active = false }: { status: KodeTodo["status"]; active?: boolean }) {
  if (status === "completed") {
    return (
      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-500/90">
        <Check size={9} strokeWidth={3} />
      </span>
    );
  }
  // The step being worked on right now spins while the agent runs.
  if (status === "in_progress" && active) {
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-purple-500" />;
  }
  if (status === "cancelled") {
    return (
      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-foreground/40">
        <Minus size={9} strokeWidth={3} />
      </span>
    );
  }
  if (status === "in_progress") {
    return <span className="mt-0.5 size-3.5 shrink-0 rounded-full border-[3px] border-foreground" />;
  }
  return <span className="mt-0.5 size-3.5 shrink-0 rounded-full border border-foreground/30" />;
}

export function TodoList({ todos, hideCount, running = false }: { todos: KodeTodo[]; hideCount?: boolean; running?: boolean }) {
  if (todos.length === 0) return null;
  const done = todos.filter((todo) => todo.status === "completed").length;

  return (
    <div className="mb-3">
      {hideCount ? null : (
        <p className="mb-1.5 text-[12px] text-foreground/40">
          {done} of {todos.length}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {todos.map((todo) => (
          <li key={`${todo.status}:${todo.title}`} className="flex items-start gap-2">
            <StatusMark status={todo.status} active={running} />
            <span
              className={
                todo.status === "completed" || todo.status === "cancelled"
                  ? "text-[13.5px] leading-5 text-foreground/40 line-through decoration-foreground/25"
                  : todo.status === "in_progress"
                    ? "text-[13.5px] leading-5 text-foreground"
                    : "text-[13.5px] leading-5 text-foreground/75"
              }
            >
              {todo.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One line inside a message: the plan lives in the dock above the input. */
export function TodoSummary({ todos }: { todos: KodeTodo[] }) {
  if (todos.length === 0) return null;
  const done = todos.filter((todo) => todo.status === "completed").length;
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[12px] text-foreground/45">
      <StatusMark status={done === todos.length ? "completed" : "in_progress"} />
      Plan · {done} of {todos.length} done
    </p>
  );
}
