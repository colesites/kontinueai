"use client";

import { Bell, Bot, CalendarClock, Check, Flag, Pencil, Repeat, Trash2 } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import {
  PRIORITY_META,
  formatDue,
  isOverdue,
  recurrenceLabel,
  type Task,
} from "../lib/task-shared";

export function TaskRow({
  task,
  onToggle,
  onDelete,
  onEdit,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const done = task.status === "done";
  const priority = PRIORITY_META[task.priority];
  const overdue = isOverdue(task);

  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={cn(
            "truncate text-sm",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
          {task.dueDate != null && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "text-red-500",
              )}
            >
              <CalendarClock size={11} />
              {formatDue(task.dueDate)}
            </span>
          )}
          {task.priority !== "medium" && (
            <span
              className={cn("inline-flex items-center gap-1", priority.className)}
            >
              <Flag size={11} />
              {priority.label}
            </span>
          )}
          {task.reminderMinutesBefore != null && (
            <span className="inline-flex items-center gap-1">
              <Bell size={11} />
            </span>
          )}
          {task.recurring && (
            <span
              className="inline-flex items-center gap-1"
              title={recurrenceLabel(task.recurrenceRule)}
            >
              <Repeat size={11} />
              {recurrenceLabel(task.recurrenceRule)}
            </span>
          )}
          {task.isAgentTask && (
            <span
              className="inline-flex items-center gap-1 text-primary"
              title="K-AI runs this automatically"
            >
              <Bot size={11} />
              K-AI
            </span>
          )}
        </div>
      </button>

      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit task"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete task"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
