// The small pickers a task is edited with (due date, priority, reminder,
// repeat). Each is a chip that shows its value and opens a menu or popover,
// so the composer and the inspector share one set of controls.

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Bell, CalendarClock, Check, ChevronLeft, ChevronRight, Flag, Repeat, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dayKey,
  formatDue,
  PRIORITIES,
  priorityMeta,
  RECURRENCES,
  recurrenceLabel,
  reminderLabel,
  REMINDERS,
  startOfDay,
  type TaskPriority,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;

/** Chip trigger. `set` draws it as holding a value rather than a prompt. */
function chipClassName(set: boolean, disabled?: boolean) {
  return cn(
    "kontinue-3d flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 text-label transition-colors",
    set ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    disabled && "pointer-events-none opacity-45",
  );
}

function MenuField<T extends string | number | null>({
  icon: Icon,
  iconColor,
  label,
  ariaLabel,
  set,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  icon: IconType;
  iconColor?: string;
  label: string;
  ariaLabel: string;
  set: boolean;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" aria-label={`${ariaLabel}: ${label}`} title={title} className={chipClassName(set, disabled)}>
          <Icon size={13} className="shrink-0" style={iconColor ? { color: iconColor } : undefined} />
          <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {options.map((option) => (
          <DropdownMenuItem key={String(option.value)} onSelect={() => onChange(option.value)}>
            {option.icon}
            <span className="flex-1 truncate">{option.label}</span>
            {option.value === value ? <Check size={13} className="text-[var(--brand)]" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityField({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
  const meta = priorityMeta(value);
  return (
    <MenuField
      icon={Flag}
      iconColor={meta.color}
      label={meta.label}
      ariaLabel="Priority"
      set={value !== "medium"}
      value={value}
      onChange={onChange}
      options={PRIORITIES.map((p) => ({
        value: p.value,
        label: p.label,
        icon: <Flag size={13} style={{ color: p.color }} />,
      }))}
    />
  );
}

export function RepeatField({ value, onChange }: { value: string | null; onChange: (rule: string | null) => void }) {
  return (
    <MenuField
      icon={Repeat}
      label={value ? recurrenceLabel(value) : "Repeat"}
      ariaLabel="Repeat"
      set={value != null}
      value={value}
      onChange={onChange}
      options={RECURRENCES.map((r) => ({ value: r.rule, label: r.label }))}
    />
  );
}

/** A reminder is relative to the due time, so it needs one. */
export function ReminderField({
  value,
  dueDate,
  onChange,
}: {
  value: number | null;
  dueDate: number | null;
  onChange: (minutes: number | null) => void;
}) {
  const disabled = dueDate == null;
  const options = REMINDERS.some((r) => r.minutes === value)
    ? REMINDERS
    : [...REMINDERS, { minutes: value, label: reminderLabel(value) }];
  return (
    <MenuField
      icon={Bell}
      label={value == null ? "Remind me" : reminderLabel(value)}
      ariaLabel="Reminder"
      set={value != null}
      value={value}
      onChange={onChange}
      disabled={disabled}
      title={disabled ? "Set a due date to add a reminder" : undefined}
      options={options.map((r) => ({ value: r.minutes, label: r.label }))}
    />
  );
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_HOUR = 9;

function toTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Keep the current time of day when the day changes; default to 9:00 AM. */
function onDay(day: Date, current: number | null): number {
  const next = new Date(day);
  if (current != null) {
    const from = new Date(current);
    next.setHours(from.getHours(), from.getMinutes(), 0, 0);
  } else {
    next.setHours(DEFAULT_HOUR, 0, 0, 0);
  }
  return next.getTime();
}

function presets(current: number | null): { label: string; value: number }[] {
  const now = new Date();
  // "Today" must still be ahead of now: 9 AM, or the next full hour after it.
  const today = new Date(now);
  if (current != null) {
    const from = new Date(current);
    today.setHours(from.getHours(), from.getMinutes(), 0, 0);
  } else {
    today.setHours(DEFAULT_HOUR, 0, 0, 0);
  }
  if (today.getTime() <= now.getTime()) {
    today.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7)); // next Monday
  return [
    { label: "Today", value: today.getTime() },
    { label: "Tomorrow", value: onDay(tomorrow, current) },
    { label: "Next week", value: onDay(nextWeek, current) },
  ];
}

export function DueDateField({
  value,
  onChange,
  placeholder = "Due date",
  align = "start",
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = new Date(value ?? Date.now());
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

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
  const selectedKey = value != null ? dayKey(value) : null;
  const overdue = value != null && value < startOfDay();

  const handleOpen = (next: boolean) => {
    if (next) {
      const d = new Date(value ?? Date.now());
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <div className={cn(chipClassName(value != null), "gap-0 px-0")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={value != null ? `Due ${formatDue(value)}` : placeholder}
            className={cn("flex h-full min-w-0 items-center gap-1.5 rounded-full pl-2.5", value != null ? "pr-1" : "pr-2.5")}
          >
            <CalendarClock size={13} className="shrink-0" style={overdue ? { color: "var(--status-danger)" } : undefined} />
            <span className="truncate" style={overdue ? { color: "var(--status-danger)" } : undefined}>
              {value != null ? formatDue(value) : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        {value != null ? (
          <button
            type="button"
            aria-label="Clear due date"
            onClick={() => onChange(null)}
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
          >
            <X size={11} />
          </button>
        ) : null}
      </div>
      <PopoverContent align={align} sideOffset={6} collisionPadding={12} className="w-[272px] border-0 p-3">
        <div className="mb-2 flex gap-1.5">
          {presets(value).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange(preset.value);
                setOpen(false);
              }}
              title={formatDue(preset.value)}
              className="kontinue-3d flex h-7 flex-1 items-center justify-center rounded-full text-caption whitespace-nowrap text-foreground/85 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between py-1 pl-1">
          <p className="text-label font-medium">
            {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {WEEKDAYS.map((day, index) => (
            <span key={WEEKDAY_NAMES[index]} aria-hidden className="py-1 text-micro font-medium text-muted-foreground/70">
              {day}
            </span>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} />;
            const key = `${year}-${month}-${day}`;
            const selected = key === selectedKey;
            return (
              <button
                key={key}
                type="button"
                aria-label={new Date(year, month, day).toLocaleDateString(undefined, { dateStyle: "full" })}
                aria-pressed={selected}
                onClick={() => onChange(onDay(new Date(year, month, day), value))}
                className={cn(
                  "mx-auto flex size-8 items-center justify-center rounded-full text-label tabular-nums transition-colors",
                  selected
                    ? "bg-[var(--brand)] font-semibold text-white"
                    : "kontinue-hover",
                  !selected && key === todayKey && "font-semibold text-[var(--brand)]",
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/[0.06] pt-2.5 dark:border-white/[0.06]">
          <label htmlFor="task-due-time" className="pl-1 text-label text-muted-foreground">
            Time
          </label>
          <input
            id="task-due-time"
            type="time"
            value={value != null ? toTimeInput(value) : ""}
            disabled={value == null}
            onChange={(e) => {
              if (value == null || !e.target.value) return;
              const [h, m] = e.target.value.split(":").map(Number);
              const next = new Date(value);
              next.setHours(h ?? 0, m ?? 0, 0, 0);
              onChange(next.getTime());
            }}
            className="kontinue-3d h-7 rounded-full bg-transparent px-2.5 text-label tabular-nums outline-none disabled:opacity-45"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
