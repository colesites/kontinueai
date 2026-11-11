// List view: tasks grouped by when they are due. Rows are one keyboard list:
// ↑/↓ move, Enter opens details, Space completes, ⌫ deletes.

import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { BUCKET_LABEL, BUCKET_ORDER, type Task, type TaskBucket } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TaskCheck, TaskMeta } from "./TaskParts";

type Props = {
  groups: Record<TaskBucket, Task[]>;
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
};

/** Move focus between rows without tracking an index in state. */
function focusSibling(row: HTMLElement, delta: number) {
  const rows = Array.from(
    row.closest("[data-task-list]")?.querySelectorAll<HTMLElement>("[data-task-row]") ?? [],
  );
  rows[rows.indexOf(row) + delta]?.focus();
}

function TaskRow({
  task,
  selected,
  onSelect,
  onToggle,
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  return (
    <div
      role="listitem"
      data-task-row
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusSibling(event.currentTarget, 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusSibling(event.currentTarget, -1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          onSelect();
        } else if (event.key === " ") {
          event.preventDefault();
          onToggle();
        } else if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          // Keep the keyboard in the list after the row goes away.
          const row = event.currentTarget;
          const rows = Array.from(
            row.closest("[data-task-list]")?.querySelectorAll<HTMLElement>("[data-task-row]") ?? [],
          );
          const index = rows.indexOf(row);
          (rows[index + 1] ?? rows[index - 1])?.focus();
          onDelete();
        }
      }}
      className={cn(
        "group/row flex cursor-default items-start gap-3 rounded-[14px] px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand)]",
        selected ? "bg-black/[0.05] dark:bg-white/[0.07]" : "kontinue-hover",
      )}
    >
      <TaskCheck task={task} onToggle={onToggle} className="mt-px" />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-body leading-[18px]", done && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        <TaskMeta task={task} className="mt-1" />
      </div>
      <button
        type="button"
        aria-label={`Delete "${task.title}"`}
        title="Delete"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="-my-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-[opacity,color] group-hover/row:opacity-100 hover:text-[var(--status-danger)]"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function TaskList({ groups, selectedId, onSelect, onToggle, onDelete }: Props) {
  // Completed starts folded so finished work doesn't bury what is open.
  const [folded, setFolded] = useState<Partial<Record<TaskBucket, boolean>>>({ completed: true });

  return (
    <div data-task-list className="flex flex-col gap-5">
      {BUCKET_ORDER.map((bucket) => {
        const items = groups[bucket];
        if (items.length === 0) return null;
        const isFolded = folded[bucket] ?? false;
        return (
          <section key={bucket} aria-label={BUCKET_LABEL[bucket]}>
            <button
              type="button"
              aria-expanded={!isFolded}
              onClick={() => setFolded((current) => ({ ...current, [bucket]: !isFolded }))}
              className="mb-1 flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-1.5 text-label font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight size={13} className={cn("transition-transform", !isFolded && "rotate-90")} />
              <span style={bucket === "overdue" ? { color: "var(--status-danger)" } : undefined}>
                {BUCKET_LABEL[bucket]}
              </span>
              <span className="tabular-nums text-muted-foreground/70">{items.length}</span>
            </button>
            {isFolded ? null : (
              <div role="list" className="flex flex-col gap-px">
                {items.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    selected={task._id === selectedId}
                    onSelect={() => onSelect(task._id)}
                    onToggle={() => onToggle(task)}
                    onDelete={() => onDelete(task)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
