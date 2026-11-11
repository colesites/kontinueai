// Pieces every task view draws: the round status check and the metadata line
// (due date, priority, reminder, repeat, K-AI).

import { Bell, Bot, CalendarClock, Check, Flag, Repeat } from "lucide-react";
import { formatDue, isOverdue, priorityMeta, recurrenceLabel, reminderLabel, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export function TaskCheck({
  task,
  onToggle,
  className,
}: {
  task: Task;
  onToggle: () => void;
  className?: string;
}) {
  const done = task.status === "done";
  const started = task.status === "in_progress";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "group/check flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
        done
          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
          : "border-foreground/30 text-transparent hover:border-[var(--brand)] hover:text-[var(--brand)]",
        className,
      )}
    >
      {done ? (
        <Check size={11} strokeWidth={3} />
      ) : started ? (
        // In progress: a filled core, replaced by the check on hover.
        <>
          <span className="size-2 rounded-full bg-[var(--brand)] group-hover/check:hidden" />
          <Check size={11} strokeWidth={3} className="hidden group-hover/check:block" />
        </>
      ) : (
        <Check size={11} strokeWidth={3} />
      )}
    </button>
  );
}

/** One line of facts under a task title. Renders nothing when there are none. */
export function TaskMeta({ task, className }: { task: Task; className?: string }) {
  const priority = priorityMeta(task.priority);
  const overdue = isOverdue(task);
  const items: React.ReactNode[] = [];

  if (task.dueDate != null) {
    items.push(
      <span key="due" className="inline-flex items-center gap-1" style={overdue ? { color: "var(--status-danger)" } : undefined}>
        <CalendarClock size={11} />
        {formatDue(task.dueDate)}
      </span>,
    );
  }
  if (task.status === "in_progress") {
    items.push(
      <span key="status" className="inline-flex items-center gap-1 text-[var(--brand)]">
        <span className="size-1.5 rounded-full bg-current" />
        In progress
      </span>,
    );
  }
  if (task.priority !== "medium") {
    items.push(
      <span key="priority" className="inline-flex items-center gap-1" style={{ color: priority.color }}>
        <Flag size={11} />
        {priority.label}
      </span>,
    );
  }
  if (task.reminderMinutesBefore != null) {
    items.push(
      <span key="reminder" className="inline-flex items-center gap-1" title={`Reminder: ${reminderLabel(task.reminderMinutesBefore)}`}>
        <Bell size={11} />
        <span className="sr-only">Reminder {reminderLabel(task.reminderMinutesBefore)}</span>
      </span>,
    );
  }
  if (task.recurring) {
    items.push(
      <span key="repeat" className="inline-flex items-center gap-1">
        <Repeat size={11} />
        {recurrenceLabel(task.recurrenceRule)}
      </span>,
    );
  }
  if (task.isAgentTask) {
    items.push(
      <span key="agent" className="inline-flex items-center gap-1 text-[var(--brand)]" title="K-AI runs this at the due time">
        <Bot size={11} />
        K-AI
      </span>,
    );
  }

  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-caption text-muted-foreground", className)}>
      {items}
    </div>
  );
}
