import type { Doc } from "@repo/convex/convex/_generated/dataModel";

export type Task = Doc<"tasks">;
export type Bucket = "overdue" | "today" | "upcoming" | "completed";
export type TaskView = "list" | "kanban" | "calendar";

export const PRIORITY_META: Record<
  Task["priority"],
  { label: string; className: string }
> = {
  urgent: { label: "Urgent", className: "text-red-500" },
  high: { label: "High", className: "text-orange-500" },
  medium: { label: "Medium", className: "text-amber-500" },
  low: { label: "Low", className: "text-muted-foreground" },
};

export const STATUS_COLUMNS: {
  status: Task["status"];
  label: string;
}[] = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  completed: "Completed",
};

// Reminder offset presets (minutes before due date).
export const REMINDER_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "No reminder", minutes: null },
  { label: "5 min before", minutes: 5 },
  { label: "15 min before", minutes: 15 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
];

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function bucketFor(task: Task): Bucket {
  if (task.status === "done") return "completed";
  if (task.dueDate == null) return "upcoming";
  if (task.dueDate < startOfToday()) return "overdue";
  if (task.dueDate <= endOfToday()) return "today";
  return "upcoming";
}

export function formatDue(ms: number): string {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  // Only append a time when it isn't midnight (date-only tasks stay clean).
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  if (!hasTime) return datePart;
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

export function isOverdue(task: Task): boolean {
  return (
    task.status !== "done" &&
    task.dueDate != null &&
    task.dueDate < startOfToday()
  );
}
