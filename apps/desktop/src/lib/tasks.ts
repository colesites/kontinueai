// Shared task vocabulary for the Tasks screen: buckets, labels, option lists
// and date formatting. Mirrors the web app (features/tasks/lib/task-shared.ts)
// so a task reads the same on every device.

import type { KontinueTask } from "@/lib/convex-api";

export type Task = KontinueTask;
export type TaskPriority = Task["priority"];
export type TaskStatus = Task["status"];
export type TaskBucket = "overdue" | "today" | "upcoming" | "someday" | "completed";
export type TaskViewMode = "list" | "board" | "calendar";

export const BUCKET_ORDER: TaskBucket[] = ["overdue", "today", "upcoming", "someday", "completed"];

export const BUCKET_LABEL: Record<TaskBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  someday: "No date",
  completed: "Completed",
};

export const STATUS_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

/** Highest first, the order pickers show them in. `color` is a CSS variable. */
export const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: "urgent", label: "Urgent", color: "var(--status-danger)" },
  { value: "high", label: "High", color: "var(--status-warning)" },
  { value: "medium", label: "Medium", color: "var(--status-caution)" },
  { value: "low", label: "Low", color: "var(--muted-foreground)" },
];

export function priorityMeta(priority: TaskPriority) {
  return PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[2];
}

/** Minutes before the due time. null = no reminder. */
export const REMINDERS: { minutes: number | null; label: string }[] = [
  { minutes: null, label: "No reminder" },
  { minutes: 0, label: "At due time" },
  { minutes: 5, label: "5 minutes before" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
];

export function reminderLabel(minutes: number | null | undefined): string {
  if (minutes == null) return "No reminder";
  const preset = REMINDERS.find((r) => r.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}

/** RRULE-ish string stored on the task. null = does not repeat. */
export const RECURRENCES: { rule: string | null; label: string }[] = [
  { rule: null, label: "Does not repeat" },
  { rule: "FREQ=DAILY", label: "Daily" },
  { rule: "FREQ=WEEKLY", label: "Weekly" },
  { rule: "FREQ=MONTHLY", label: "Monthly" },
  { rule: "FREQ=YEARLY", label: "Yearly" },
];

export function recurrenceLabel(rule: string | null | undefined): string {
  return RECURRENCES.find((r) => r.rule === (rule ?? null))?.label ?? "Custom";
}

export function startOfDay(ms: number = Date.now()): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number = Date.now()): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function bucketFor(task: Task, now: number = Date.now()): TaskBucket {
  if (task.status === "done") return "completed";
  if (task.dueDate == null) return "someday";
  if (task.dueDate < startOfDay(now)) return "overdue";
  if (task.dueDate <= endOfDay(now)) return "today";
  return "upcoming";
}

export function isOverdue(task: Task, now: number = Date.now()): boolean {
  return task.status !== "done" && task.dueDate != null && task.dueDate < startOfDay(now);
}

/** A due date with no time component is stored at local midnight. */
export function hasTime(ms: number): boolean {
  const d = new Date(ms);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow, 3:00 PM", "Mon, 9:00 AM", "Aug 1", "Aug 1, 2025". */
export function formatDue(ms: number, now: number = Date.now()): string {
  const date = new Date(ms);
  const dayDiff = Math.round((startOfDay(ms) - startOfDay(now)) / 86_400_000);
  let day: string;
  if (dayDiff === 0) day = "Today";
  else if (dayDiff === 1) day = "Tomorrow";
  else if (dayDiff === -1) day = "Yesterday";
  else if (dayDiff > 1 && dayDiff < 7) day = date.toLocaleDateString(undefined, { weekday: "short" });
  else {
    const sameYear = date.getFullYear() === new Date(now).getFullYear();
    day = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }
  return hasTime(ms) ? `${day}, ${formatTime(ms)}` : day;
}

/** Local calendar key ("2026-10-3") used to group tasks by day. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Move a timestamp to another calendar day, keeping its time of day. */
export function withDay(ms: number | null | undefined, day: Date): number {
  const next = new Date(day);
  if (ms != null) {
    const from = new Date(ms);
    next.setHours(from.getHours(), from.getMinutes(), 0, 0);
  } else {
    next.setHours(0, 0, 0, 0);
  }
  return next.getTime();
}

/** Open tasks first by due date (undated last), then newest; done by completion. */
export function sortTasks(a: Task, b: Task): number {
  if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
  if (a.status === "done") return (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt);
  const aDue = a.dueDate ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return b.createdAt - a.createdAt;
}

export function groupByBucket(tasks: Task[], now: number = Date.now()): Record<TaskBucket, Task[]> {
  const groups: Record<TaskBucket, Task[]> = { overdue: [], today: [], upcoming: [], someday: [], completed: [] };
  for (const task of [...tasks].sort(sortTasks)) groups[bucketFor(task, now)].push(task);
  return groups;
}

export function matchesQuery(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${task.title} ${task.description ?? ""} ${task.aiInstruction ?? ""}`.toLowerCase().includes(q);
}

/** When a task's reminder should fire, or null if it has none to fire.
 *  A due date alone reminds at the due time, the same rule the server uses. */
export function reminderFireAt(task: Task): number | null {
  if (task.status === "done" || task.dueDate == null) return null;
  // Date-only tasks without an explicit reminder would fire at midnight.
  if (task.reminderMinutesBefore == null && !hasTime(task.dueDate)) return null;
  return task.dueDate - (task.reminderMinutesBefore ?? 0) * 60_000;
}

/** The fields needed to recreate a task (undo after delete). */
export function taskSnapshot(task: Task) {
  return {
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
    status: task.status,
    recurring: task.recurring,
    recurrenceRule: task.recurrenceRule,
    isAgentTask: task.isAgentTask,
    aiInstruction: task.aiInstruction,
    reminderMinutesBefore: task.reminderMinutesBefore,
  };
}
