"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@repo/ui/lib/utils";

type Mode = "analog" | "digital";

type ClockWidgetProps = {
  /** IANA timezone (e.g. "America/New_York"). Falls back to client local. */
  timezone?: string | null;
};

type TimeParts = {
  h: number;
  m: number;
  s: number;
  weekday: string;
  dateLabel: string;
};

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function resolveTimezone(tz?: string | null): string {
  if (tz && isValidTimezone(tz)) return tz;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getTimeInZone(timezone: string): TimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    h: Number(get("hour")),
    m: Number(get("minute")),
    s: Number(get("second")),
    weekday: get("weekday"),
    dateLabel: `${get("month")} ${get("day")}, ${get("year")}`,
  };
}

function getTimezoneLabel(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

export function ClockWidget({ timezone }: ClockWidgetProps) {
  const [mode, setMode] = useState<Mode>("analog");

  const tz = useMemo(() => resolveTimezone(timezone), [timezone]);

  const [time, setTime] = useState<TimeParts>(() => getTimeInZone(tz));

  useEffect(() => {
    const tick = () => setTime(getTimeInZone(tz));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);

  const { h, m, s, weekday, dateLabel } = time;
  const secondDeg = s * 6;
  const minuteDeg = m * 6 + s * 0.1;
  const hourDeg = (h % 12) * 30 + m * 0.5;

  return (
    <div className="mt-3 inline-flex w-[240px] flex-col gap-3 rounded-2xl p-4 glass-subtle animate-fade-in-up">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <span className="eyebrow">Clock</span>
        <span className="text-[11px] font-medium text-muted-foreground/70">
          {getTimezoneLabel(tz)}
        </span>
      </div>

      {/* Body */}
      <div className="relative flex h-[160px] w-full items-center justify-center">
        {mode === "analog" ? (
          <AnalogClock hour={hourDeg} minute={minuteDeg} second={secondDeg} />
        ) : (
          <DigitalClock
            h={h}
            m={m}
            s={s}
            weekday={weekday}
            dateLabel={dateLabel}
          />
        )}
      </div>

      {/* Toggle */}
      <div className="flex w-full rounded-full bg-foreground/5 p-0.5 ring-1 ring-foreground/8">
        {(["analog", "digital"] as Mode[]).map((m_) => (
          <button
            key={m_}
            type="button"
            onClick={() => setMode(m_)}
            className={cn(
              "flex-1 rounded-full px-2 py-1 text-[11px] font-semibold capitalize transition-all duration-200",
              mode === m_
                ? "bg-foreground text-background shadow-[0_1px_4px_-1px_color-mix(in_oklch,black_25%,transparent)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m_}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalogClock({
  hour,
  minute,
  second,
}: {
  hour: number;
  minute: number;
  second: number;
}) {
  return (
    <svg viewBox="0 0 200 200" className="size-[160px]">
      {/* Face */}
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="color-mix(in oklch, var(--foreground) 3%, transparent)"
        stroke="color-mix(in oklch, var(--foreground) 10%, transparent)"
        strokeWidth="1"
      />

      {/* Hour ticks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = i * 30 * (Math.PI / 180);
        const isQuarter = i % 3 === 0;
        const r1 = isQuarter ? 76 : 80;
        const r2 = 86;
        return (
          <line
            key={i}
            x1={100 + Math.sin(angle) * r1}
            y1={100 - Math.cos(angle) * r1}
            x2={100 + Math.sin(angle) * r2}
            y2={100 - Math.cos(angle) * r2}
            stroke="currentColor"
            strokeWidth={isQuarter ? 2.5 : 1.25}
            strokeLinecap="round"
            className={isQuarter ? "text-foreground/70" : "text-foreground/35"}
          />
        );
      })}

      {/* Hour hand */}
      <line
        x1="100"
        y1="108"
        x2="100"
        y2="56"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-foreground/90"
        style={{
          transform: `rotate(${hour}deg)`,
          transformOrigin: "100px 100px",
          transition: "transform 500ms cubic-bezier(0.4, 2, 0.6, 1)",
        }}
      />

      {/* Minute hand */}
      <line
        x1="100"
        y1="110"
        x2="100"
        y2="36"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="text-foreground/75"
        style={{
          transform: `rotate(${minute}deg)`,
          transformOrigin: "100px 100px",
          transition: "transform 500ms cubic-bezier(0.4, 2, 0.6, 1)",
        }}
      />

      {/* Second hand */}
      <line
        x1="100"
        y1="116"
        x2="100"
        y2="24"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          transform: `rotate(${second}deg)`,
          transformOrigin: "100px 100px",
          transition:
            second === 0
              ? "none"
              : "transform 500ms cubic-bezier(0.4, 2, 0.6, 1)",
          filter: "drop-shadow(0 0 3px color-mix(in oklch, var(--primary) 50%, transparent))",
        }}
      />

      {/* Center pivot */}
      <circle cx="100" cy="100" r="5" fill="var(--primary)" />
      <circle cx="100" cy="100" r="1.5" fill="var(--background)" />
    </svg>
  );
}

function DigitalClock({
  h,
  m,
  s,
  weekday,
  dateLabel,
}: {
  h: number;
  m: number;
  s: number;
  weekday: string;
  dateLabel: string;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex items-baseline gap-0.5 font-mono text-[34px] font-bold leading-none tracking-tight tabular-nums">
        <span className="text-foreground">{pad(h)}</span>
        <span className="text-foreground/40 animate-pulse-soft">:</span>
        <span className="text-foreground">{pad(m)}</span>
        <span className="text-primary/50 mx-0.5 text-[20px]">:</span>
        <span className="text-primary text-[20px]">{pad(s)}</span>
      </div>
      <p className="mt-3 text-[12px] font-medium text-muted-foreground">
        {weekday}
      </p>
      <p className="text-[11px] text-muted-foreground/70">{dateLabel}</p>
    </div>
  );
}
