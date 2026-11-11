// Calendar view: a month of due dates. Drag a task to another day to
// reschedule it (the time of day is kept); click a day to add a task on it.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PillButton } from "@/components/settings/settings-ui";
import { dayKey, formatTime, hasTime, priorityMeta, sortTasks, withDay, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const DRAG_TYPE = "application/x-kontinue-task";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PER_DAY = 3;

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function TaskCalendar({
  tasks,
  selectedId,
  onSelect,
  onReschedule,
  onCreateOn,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (taskId: string) => void;
  onReschedule: (task: Task, dueDate: number) => void;
  /** Start a new task due on this day (9:00 AM). */
  onCreateOn: (dueDate: number) => void;
}) {
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const [over, setOver] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of [...tasks].sort(sortTasks)) {
      if (task.dueDate == null) continue;
      const key = dayKey(task.dueDate);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => {
    const lead = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= count; day += 1) out.push(day);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  const todayKey = dayKey(Date.now());
  const undated = tasks.filter((task) => task.dueDate == null && task.status !== "done").length;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lead font-semibold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1.5">
          {undated > 0 ? (
            <span className="mr-1 text-label text-muted-foreground">
              {undated} without a date {undated === 1 ? "is" : "are"} in List
            </span>
          ) : null}
          <PillButton onClick={() => setCursor(monthStart(new Date()))}>Today</PillButton>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="kontinue-3d flex size-8 items-center justify-center rounded-full text-foreground/80 hover:text-foreground"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="kontinue-3d flex size-8 items-center justify-center rounded-full text-foreground/80 hover:text-foreground"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px pb-1.5">
        {WEEKDAYS.map((day) => (
          <span key={day} className="px-2 text-caption font-medium text-muted-foreground/80">
            {day}
          </span>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-7 overflow-hidden rounded-[20px] border border-[var(--edge)]">
        {cells.map((day, index) => {
          const column = index % 7;
          const lastRow = index >= cells.length - 7;
          const edges = cn(column !== 6 && "border-r", !lastRow && "border-b", "border-[var(--edge)]");
          if (day === null) {
            return <div key={`blank-${index}`} className={cn("min-h-[104px] bg-black/[0.015] dark:bg-white/[0.012]", edges)} />;
          }
          const date = new Date(year, month, day);
          const key = `${year}-${month}-${day}`;
          const dayTasks = byDay.get(key) ?? [];
          const expanded = expandedDay === key;
          const shown = expanded ? dayTasks : dayTasks.slice(0, MAX_PER_DAY);
          const isToday = key === todayKey;
          const label = date.toLocaleDateString(undefined, { dateStyle: "full" });
          return (
            <div
              key={key}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(key);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setOver((current) => (current === key ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const task = tasks.find((t) => t._id === event.dataTransfer.getData(DRAG_TYPE));
                if (!task) return;
                const next = withDay(task.dueDate, date);
                if (next !== task.dueDate) onReschedule(task, next);
              }}
              className={cn(
                "group/day @container relative flex min-h-[104px] min-w-0 flex-col gap-0.5 p-1.5 transition-colors",
                edges,
                over === key && "bg-[var(--brand-soft)]",
              )}
            >
              <div className="flex h-6 items-center justify-between pl-0.5">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-label tabular-nums",
                    isToday ? "bg-[var(--brand)] font-semibold text-white" : "text-muted-foreground",
                  )}
                >
                  {day}
                </span>
                <button
                  type="button"
                  aria-label={`Add a task on ${label}`}
                  title="Add a task on this day"
                  onClick={() => {
                    const at = new Date(date);
                    at.setHours(9, 0, 0, 0);
                    onCreateOn(at.getTime());
                  }}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 kontinue-hover hover:text-foreground focus-visible:opacity-100"
                >
                  <Plus size={12} />
                </button>
              </div>
              {shown.map((task) => {
                const done = task.status === "done";
                return (
                  <button
                    key={task._id}
                    type="button"
                    draggable
                    title={task.title}
                    aria-current={task._id === selectedId ? "true" : undefined}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_TYPE, task._id);
                      event.dataTransfer.setData("text/plain", task.title);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onSelect(task._id)}
                    className={cn(
                      "flex h-[22px] w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-caption transition-colors",
                      task._id === selectedId
                        ? "bg-[var(--brand-soft)] text-foreground"
                        : "bg-black/[0.04] kontinue-hover dark:bg-white/[0.06]",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: done ? "var(--muted-foreground)" : priorityMeta(task.priority).color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.dueDate != null && hasTime(task.dueDate) ? (
                      // The time only shows when the day column has room for it.
                      <span className="hidden shrink-0 text-micro tabular-nums text-muted-foreground @[150px]:inline">
                        {formatTime(task.dueDate).replace(/\s/g, "").toLowerCase()}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {dayTasks.length > MAX_PER_DAY ? (
                <button
                  type="button"
                  onClick={() => setExpandedDay(expanded ? null : key)}
                  className="self-start rounded-md px-1.5 text-caption text-muted-foreground hover:text-foreground"
                >
                  {expanded ? "Show less" : `${dayTasks.length - MAX_PER_DAY} more`}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
