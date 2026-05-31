"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@repo/ui/lib/utils";
import { Calendar } from "@repo/ui/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { TimeField } from "./TimeField";

type DateTimePickerProps = {
  // Epoch milliseconds, or null when unset.
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  // When true, render compact (icon-only when empty).
  align?: "start" | "center" | "end";
  // Open the picker immediately on mount (used when the user explicitly picks
  // "Custom time…" so the time input shows right away instead of a stale value).
  autoOpen?: boolean;
};

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Set due date",
  className,
  align = "start",
  autoOpen = false,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(autoOpen);
  const current = value != null ? new Date(value) : undefined;
  const timeValue = current ? toTimeInput(current) : "09:00";

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) {
      onChange(null);
      return;
    }
    // Preserve the existing time-of-day, default to 09:00.
    const [h, m] = timeValue.split(":").map(Number);
    const next = new Date(day);
    next.setHours(h ?? 9, m ?? 0, 0, 0);
    onChange(next.getTime());
  };

  const handleTimeChange = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const base = current ?? new Date();
    const next = new Date(base);
    next.setHours(h ?? 0, m ?? 0, 0, 0);
    onChange(next.getTime());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-foreground/5",
            current ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <CalendarClock size={14} className="shrink-0" />
          <span className="truncate">
            {current ? format(current, "MMM d, h:mm a") : placeholder}
          </span>
          {current && (
            <X
              size={13}
              className="ml-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-3">
        <Calendar
          mode="single"
          selected={current}
          onSelect={handleDateSelect}
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <label className="text-xs font-medium text-muted-foreground">
            Time
          </label>
          <TimeField value={timeValue} onChange={handleTimeChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
