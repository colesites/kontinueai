"use client";

import { cn } from "@repo/ui/lib/utils";

// A compact 12-hour time picker: hour / minute / AM-PM dropdowns. Value/onChange
// use "HH:mm" 24-hour strings so callers stay timezone-agnostic.
type TimeFieldProps = {
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  className?: string;
};

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

function parse(value: string): { hour12: number; minute: number; pm: boolean } {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr ?? "9");
  const minute = Number(mStr ?? "0");
  const pm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute, pm };
}

function build(hour12: number, minute: number, pm: boolean): string {
  let h = hour12 % 12;
  if (pm) h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const selectCls =
  "h-8 rounded-md border border-input bg-transparent px-1.5 text-sm tabular-nums transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TimeField({ value, onChange, className }: TimeFieldProps) {
  const { hour12, minute, pm } = parse(value);
  // Snap the displayed minute to the nearest preset so it always matches an option.
  const nearestMinute = MINUTES.reduce((a, b) =>
    Math.abs(b - minute) < Math.abs(a - minute) ? b : a,
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select
        aria-label="Hour"
        value={hour12}
        onChange={(e) => onChange(build(Number(e.target.value), nearestMinute, pm))}
        className={selectCls}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select
        aria-label="Minute"
        value={nearestMinute}
        onChange={(e) => onChange(build(hour12, Number(e.target.value), pm))}
        className={selectCls}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select
        aria-label="AM or PM"
        value={pm ? "pm" : "am"}
        onChange={(e) => onChange(build(hour12, nearestMinute, e.target.value === "pm"))}
        className={selectCls}
      >
        <option value="am">AM</option>
        <option value="pm">PM</option>
      </select>
    </div>
  );
}
