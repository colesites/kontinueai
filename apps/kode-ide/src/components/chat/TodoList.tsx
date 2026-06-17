import { Check, Circle, Loader2 } from "lucide-react";

import {
  Queue,
  QueueItem,
  QueueItemContent,
} from "@/components/ai-elements/queue";
import {
  Task,
  TaskContent,
  TaskTrigger,
} from "@/components/ai-elements/task";
import type { KodeTodo } from "@/lib/kode-tools";

function StatusIcon({ status }: { status: KodeTodo["status"] }) {
  if (status === "completed")
    return <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />;
  if (status === "in_progress")
    return (
      <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-foreground/60" />
    );
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-foreground/30" />;
}

// Renders the model's plan as a collapsible Task containing Queue rows.
export function TodoList({ todos }: { todos: KodeTodo[] }) {
  if (todos.length === 0) return null;
  const done = todos.filter((t) => t.status === "completed").length;

  return (
    <Task className="my-2 text-[13px]" defaultOpen>
      <TaskTrigger title={`Plan — ${done}/${todos.length} done`} />
      <TaskContent>
        <Queue>
          {todos.map((todo, i) => (
            <QueueItem key={`${i}-${todo.title}`} className="flex-row gap-2">
              <StatusIcon status={todo.status} />
              <QueueItemContent
                completed={todo.status === "completed"}
                className="flex flex-col gap-0.5"
              >
                <span>{todo.title}</span>
                {todo.description ? (
                  <span className="text-[11px] text-foreground/45">
                    {todo.description}
                  </span>
                ) : null}
              </QueueItemContent>
            </QueueItem>
          ))}
        </Queue>
      </TaskContent>
    </Task>
  );
}
