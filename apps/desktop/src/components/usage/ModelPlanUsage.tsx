// The plan section of the composer's context popover. A Kode model counts
// toward the Kontinue plan; a model that runs through the user's own agent
// (Claude Code, Codex, Cursor, OpenCode, Antigravity…) counts toward that
// agent's plan instead, so that is the one shown.

import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { formatReset, PlanUsageLimits, UsageBar } from "@/components/usage/KodeUsageCard";
import { useInstancePlanUsage, usageAccount, usageDashboard } from "@/lib/agent-plan-usage";
import { useAppSettings } from "@/lib/app-settings";
import { parseCliModelId } from "@/lib/kode-cli";
import { cn } from "@/lib/utils";

export function ModelPlanUsage({
  modelId,
  onSeeAll,
  className,
}: {
  modelId: string;
  onSeeAll?: () => void;
  className?: string;
}) {
  const { kodeProviders } = useAppSettings();
  const instanceId = parseCliModelId(modelId)?.instanceId;
  const instance = instanceId ? kodeProviders.find((p) => p.id === instanceId) ?? null : null;
  // Mounted only while the popover is open, so this asks only when looked at.
  const { usage, loading } = useInstancePlanUsage(instance, true);

  if (!instance) return <PlanUsageLimits className={className} onSeeAll={onSeeAll} />;

  const header = (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-label text-muted-foreground">
        {instance.label} plan usage{usage?.plan ? ` · ${capitalize(usage.plan)}` : ""}
      </p>
      {onSeeAll ? (
        <button
          type="button"
          onClick={onSeeAll}
          className="flex shrink-0 cursor-pointer items-center gap-1 text-label font-medium text-foreground/85 hover:text-foreground"
        >
          See all <ArrowRight size={11} />
        </button>
      ) : null}
    </div>
  );

  // Claude Code and Codex: their limits, asked on this Mac.
  if (usageAccount(instance)) {
    const now = Date.now();
    return (
      <div className={cn("space-y-3", className)}>
        {header}
        {usage === undefined ? (
          <p className="flex items-center gap-2 text-label text-muted-foreground">
            <Loader2 size={11} className="animate-spin" /> Reading {instance.label} usage…
          </p>
        ) : usage && usage.limits.length > 0 ? (
          usage.limits.map((limit) => {
            // A window that reset since the last read starts again at 0.
            const reset = limit.resetsAt !== null && limit.resetsAt < now;
            const pct = reset ? 0 : Math.max(0, Math.min(100, Math.round(limit.percent)));
            return (
              <div key={limit.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-label">
                  <span className="shrink-0 text-foreground/90">{limit.label}</span>
                  <span className="truncate text-muted-foreground">
                    {limit.resetsAt && !reset ? formatReset(limit.resetsAt) : ""}
                    <span className="ml-2 tabular-nums text-foreground/75">{pct}%</span>
                  </span>
                </div>
                <UsageBar pct={pct} />
              </div>
            );
          })
        ) : (
          <p className="text-label text-muted-foreground">
            {usage?.note ?? `${instance.label} hasn't reported any usage yet.`}
          </p>
        )}
        {usage && !usage.live && usage.limits.length > 0 && !loading ? (
          <p className="text-caption text-muted-foreground/70">
            Last numbers {instance.label} saved; it couldn't be asked just now.
          </p>
        ) : null}
      </div>
    );
  }

  // Cursor, Gemini CLI, Antigravity: usage lives on their website.
  const dashboard = usageDashboard(instance);
  return (
    <div className={cn("space-y-2", className)}>
      {header}
      {dashboard ? (
        <button
          type="button"
          onClick={() => void openUrl(dashboard.url)}
          className="flex cursor-pointer items-center gap-1.5 text-label text-foreground/80 hover:text-foreground"
        >
          {dashboard.name} keeps your usage on its website <ExternalLink size={11} />
        </button>
      ) : (
        <p className="text-label text-muted-foreground">
          {instance.label} doesn't report plan limits. Usage goes to the accounts or keys set up in it.
        </p>
      )}
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
