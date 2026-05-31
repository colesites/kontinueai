"use client";

import { Repeat } from "lucide-react";
import { RECURRENCE_OPTIONS } from "../lib/task-shared";

type RecurrenceFieldProps = {
  // RRULE-ish string, or null for a one-off task.
  value: string | null;
  onChange: (rule: string | null) => void;
};

// Repeat / recurring-reminder picker. Stored as an RRULE-ish string on the task
// (recurring = value != null).
export function RecurrenceField({ value, onChange }: RecurrenceFieldProps) {
  return (
    <div className="relative">
      <Repeat
        size={13}
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        aria-label="Repeat"
        className="h-9 rounded-md border border-input bg-transparent pl-7 pr-2 text-sm text-muted-foreground"
      >
        {RECURRENCE_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.rule ?? ""}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
