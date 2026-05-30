"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { type Task } from "../lib/task-shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function TaskCalendar({ tasks }: { tasks: Task[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Map of "y-m-d" -> tasks due that day.
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.dueDate == null) continue;
      const key = ymd(t.dueDate);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = ymd(Date.now());

  // Build a 6x7 grid including leading blanks.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl border border-border/60 p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">
          {cursor.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              d.setHours(0, 0, 0, 0);
              setCursor(d);
            }}
            className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60"
          >
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null)
            return <div key={`b-${idx}`} className="min-h-[72px]" />;
          const key = `${year}-${month}-${day}`;
          const dayTasks = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                "min-h-[72px] rounded-lg border border-border/40 p-1",
                isToday && "border-primary/50 bg-primary/5",
              )}
            >
              <div
                className={cn(
                  "mb-0.5 text-right text-[11px] tabular-nums text-muted-foreground",
                  isToday && "font-semibold text-primary",
                )}
              >
                {day}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayTasks.slice(0, 3).map((t) => (
                  <div
                    key={t._id}
                    title={t.title}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[10px]",
                      t.status === "done"
                        ? "bg-foreground/5 text-muted-foreground line-through"
                        : "bg-foreground/8",
                    )}
                  >
                    <span
                      className={cn(
                        "mr-1 inline-block size-1.5 rounded-full align-middle",
                      )}
                      style={{
                        backgroundColor:
                          t.priority === "urgent"
                            ? "#ef4444"
                            : t.priority === "high"
                              ? "#f97316"
                              : t.priority === "low"
                                ? "#9ca3af"
                                : "#f59e0b",
                      }}
                    />
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-foreground/60">
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
