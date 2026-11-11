import { useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/convex-api";
import { cn } from "@/lib/utils";

export const PLAN_LABEL = { free: "Free", starter: "Starter", plus: "Plus", pro: "Pro", max: "Max" } as const;

export function usagePercent(used: number, limit: number) {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function formatReset(resetAt: number) {
  const date = new Date(resetAt);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return `Resets ${time}`;
  // A weekday alone is ambiguous more than a week out (monthly limits).
  if (resetAt - Date.now() > 6 * 86_400_000) return `Resets ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  return `Resets ${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

export function UsageBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-purple-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Compact plan limits (5-hour + weekly), shown in the context popover. */
export function PlanUsageLimits({
  onSeeAll,
  className,
}: {
  onSeeAll?: () => void;
  className?: string;
}) {
  const usage = useQuery(api.kodeUsage.getUsage, {});
  if (!usage) return null;

  const rows = [
    {
      label: "5-hour limit",
      pct: usagePercent(usage.session.used, usage.session.limit),
      detail:
        usage.session.resetAt === null
          ? "Starts with your first message"
          : formatReset(usage.session.resetAt),
    },
    {
      label: "Weekly · all models",
      pct: usagePercent(usage.weekly.used, usage.weekly.limit),
      detail: formatReset(usage.weekly.resetAt),
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-label text-muted-foreground">
          Plan usage limits · {PLAN_LABEL[usage.plan]}
        </p>
        {onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex cursor-pointer items-center gap-1 text-label font-medium text-foreground/85 hover:text-foreground"
          >
            See all <ArrowRight size={11} />
          </button>
        ) : null}
      </div>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-label">
            <span className="shrink-0 text-foreground/90">{row.label}</span>
            <span className="truncate text-muted-foreground">
              {row.detail}
              <span className="ml-2 tabular-nums text-foreground/75">{row.pct}%</span>
            </span>
          </div>
          <UsageBar pct={row.pct} />
        </div>
      ))}
    </div>
  );
}
