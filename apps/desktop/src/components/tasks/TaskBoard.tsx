// Board view: one column per status. Drag a card to another column to change
// its status; the same change is available from the details pane.

import { useState } from "react";
import { STATUS_COLUMNS, sortTasks, type Task, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TaskCheck, TaskMeta } from "./TaskParts";

const DRAG_TYPE = "application/x-kontinue-task";

export function TaskBoard({
  tasks,
  selectedId,
  onSelect,
  onToggle,
  onMove,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  onToggle: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  return (
    <div className="grid min-h-full grid-cols-3 gap-3">
      {STATUS_COLUMNS.map((column) => {
        const items = tasks.filter((task) => task.status === column.status).sort(sortTasks);
        const isTarget = over === column.status && dragging != null;
        return (
          <section
            key={column.status}
            aria-label={`${column.label}, ${items.length} tasks`}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOver(column.status);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOver((current) => (current === column.status ? null : current));
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData(DRAG_TYPE);
              const task = tasks.find((t) => t._id === id);
              if (task && task.status !== column.status) onMove(task, column.status);
              setDragging(null);
              setOver(null);
            }}
            className={cn(
              "flex min-h-[240px] flex-col rounded-[20px] border p-2 transition-colors",
              isTarget
                ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--edge)] bg-black/[0.015] dark:bg-white/[0.02]",
            )}
          >
            <header className="flex h-8 items-center justify-between px-2">
              <h2 className="text-label font-medium text-muted-foreground">{column.label}</h2>
              <span className="text-caption tabular-nums text-muted-foreground/70">{items.length}</span>
            </header>
            <div className="flex flex-1 flex-col gap-1.5">
              {items.length === 0 ? (
                <p className="flex flex-1 items-center justify-center px-3 py-8 text-center text-label text-muted-foreground/60">
                  {dragging ? "Drop here" : "Nothing here"}
                </p>
              ) : (
                items.map((task) => (
                  // biome-ignore lint/a11y/useSemanticElements: a draggable card with its own checkbox can't be a <button>
                  <div
                    key={task._id}
                    role="button"
                    tabIndex={0}
                    draggable
                    aria-current={task._id === selectedId ? "true" : undefined}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_TYPE, task._id);
                      event.dataTransfer.setData("text/plain", task.title);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(task._id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onClick={() => onSelect(task._id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(task._id);
                      }
                    }}
                    className={cn(
                      "liquid-glass-card flex cursor-grab items-start gap-2.5 rounded-[14px] p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] active:cursor-grabbing",
                      task._id === selectedId && "!border-[var(--brand)]",
                      dragging === task._id && "opacity-40",
                    )}
                  >
                    <TaskCheck task={task} onToggle={() => onToggle(task)} className="mt-px" />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "line-clamp-3 text-body leading-[18px] break-words",
                          task.status === "done" && "text-muted-foreground line-through",
                        )}
                      >
                        {task.title}
                      </p>
                      <TaskMeta task={task} className="mt-1.5" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
