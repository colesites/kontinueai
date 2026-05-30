"use client";

import { useState } from "react";
import { CalendarClock, Flag, Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { cn } from "@repo/ui/lib/utils";
import {
  PRIORITY_META,
  STATUS_COLUMNS,
  formatDue,
  isOverdue,
  type Task,
} from "../lib/task-shared";

export function TaskKanban({ tasks }: { tasks: Task[] }) {
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const [draggingId, setDraggingId] = useState<Id<"tasks"> | null>(null);
  const [overColumn, setOverColumn] = useState<Task["status"] | null>(null);

  const move = async (taskId: Id<"tasks">, status: Task["status"]) => {
    const task = tasks.find((t) => t._id === taskId);
    if (!task || task.status === status) return;
    try {
      await updateTask({ taskId, status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move task");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {STATUS_COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(col.status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === col.status ? null : c))}
            onDrop={() => {
              if (draggingId) void move(draggingId, col.status);
              setDraggingId(null);
              setOverColumn(null);
            }}
            className={cn(
              "flex flex-col rounded-2xl border border-border/60 bg-foreground/[0.015] p-2 transition-colors",
              overColumn === col.status && "border-primary/50 bg-primary/5",
            )}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="eyebrow">{col.label}</span>
              <span className="text-[11px] text-muted-foreground/60">
                {items.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-1">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-muted-foreground/50">
                  Drop tasks here
                </p>
              ) : (
                items.map((task) => {
                  const priority = PRIORITY_META[task.priority];
                  return (
                    <div
                      key={task._id}
                      draggable
                      onDragStart={() => setDraggingId(task._id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={cn(
                        "group cursor-grab rounded-xl border border-border/60 bg-background p-2.5 shadow-sm transition-opacity active:cursor-grabbing",
                        draggingId === task._id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <p
                          className={cn(
                            "flex-1 text-sm",
                            task.status === "done" &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          {task.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => void deleteTask({ taskId: task._id })}
                          aria-label="Delete task"
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-foreground/8 hover:text-foreground group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
                        {task.dueDate != null && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              isOverdue(task) && "text-red-500",
                            )}
                          >
                            <CalendarClock size={11} />
                            {formatDue(task.dueDate)}
                          </span>
                        )}
                        {task.priority !== "medium" && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              priority.className,
                            )}
                          >
                            <Flag size={11} />
                            {priority.label}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
