"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

  // "Custom" can't be inferred purely from the value: a custom pick of exactly
  // 60 min collides with the "1 hour before" preset. Track it explicitly so the
  // dropdown stays on "Custom time…" and the picker shows. Seed it true when an
  // existing value isn't one of the presets.
  const [customMode, setCustomMode] = useState(value != null && !isPreset);

  // If the value is reset externally (e.g. due date cleared → null), drop custom.
  useEffect(() => {
    if (value == null) setCustomMode(false);
  }, [value]);

  const selectValue =
    customMode || (value != null && !isPreset)
      ? CUSTOM
      : value == null
        ? ""
        : String(value);

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
            if (v === "") {
              setCustomMode(false);
              return onChange(null);
            }
            if (v === CUSTOM) {
              setCustomMode(true);
              // Seed a starting point (1h before) only if nothing is set yet;
              // the picker lets the user choose the exact moment.
              if (value == null) onChange(60);
              return;
            }
            setCustomMode(false);
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
          placeholder="Pick exact reminder time"
          autoOpen
          className="w-full sm:w-auto"
          onChange={(ms) => {
            if (ms == null) {
              setCustomMode(false);
              return onChange(null);
            }
            const minutes = Math.round((dueDate - ms) / 60_000);
            onChange(minutes > 0 ? minutes : 1);
          }}
        />
      )}
    </div>
  );
}
