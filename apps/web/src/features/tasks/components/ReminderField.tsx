"use client";

import { Bell } from "lucide-react";
import { format } from "date-fns";
import { REMINDER_OPTIONS } from "../lib/task-shared";
import { DateTimePicker } from "./DateTimePicker";

const PRESET_MINUTES = REMINDER_OPTIONS.map((o) => o.minutes).filter(
  (m): m is number => m != null,
);

type ReminderFieldProps = {
  // Due date the reminder is relative to (epoch ms) — required to set a reminder.
  dueDate: number | null;
  // Minutes before due date, or null for no reminder.
  value: number | null;
  onChange: (minutesBefore: number | null) => void;
};

// Sentinel select value for the custom exact-time mode.
const CUSTOM = "custom";

export function ReminderField({ dueDate, value, onChange }: ReminderFieldProps) {
  const disabled = dueDate == null;
  const isPreset = value != null && PRESET_MINUTES.includes(value);
  const selectValue =
    value == null ? "" : isPreset ? String(value) : CUSTOM;

  // Exact reminder moment when in custom mode.
  const reminderMs =
    dueDate != null && value != null ? dueDate - value * 60_000 : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Bell
          size={13}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <select
          value={selectValue}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return onChange(null);
            if (v === CUSTOM) {
              // Default custom to 1 hour before, clamped to "now-ish".
              onChange(value ?? 60);
              return;
            }
            onChange(Number(v));
          }}
          aria-label="Reminder"
          className="h-9 rounded-md border border-input bg-transparent pl-7 pr-2 text-sm text-muted-foreground disabled:opacity-50"
        >
          {REMINDER_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.minutes ?? ""}>
              {opt.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom time…</option>
        </select>
      </div>

      {selectValue === CUSTOM && dueDate != null && (
        <DateTimePicker
          value={reminderMs}
          placeholder="Pick reminder time"
          onChange={(ms) => {
            if (ms == null) return onChange(null);
            const minutes = Math.round((dueDate - ms) / 60_000);
            onChange(minutes > 0 ? minutes : 1);
          }}
        />
      )}

      {selectValue === CUSTOM && reminderMs != null && (
        <span className="text-[11px] text-muted-foreground">
          {format(new Date(reminderMs), "MMM d, h:mm a")}
        </span>
      )}
    </div>
  );
}
