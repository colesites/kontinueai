// Settings → Usage → Your own plans: the Claude Code and Codex plan limits the
// user pays for directly, asked live from those CLIs on this Mac (agent_usage.rs).
// Kept apart from Kontinue's own limits: Kode models (including the GPT and
// Claude ones Kontinue serves) count toward Kontinue, not toward these.

import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { formatReset, UsageBar } from "@/components/usage/KodeUsageCard";
import { ModelSelectorLogo } from "@/components/chat/ModelPickerPopover";
import { useAppSettings } from "@/lib/app-settings";
import { formatActivity } from "@/lib/kode-import";
import {
  cachedAgentUsage,
  readAgentUsage,
  usageAccount,
  usageDashboard,
  type AgentUsage,
  type UsageAccount,
} from "@/lib/agent-plan-usage";

const LOGO: Record<string, string> = { claude: "anthropic", codex: "openai", cursor: "cursor", acp: "google" };

/** Two provider entries signed in to the same account show as one card. */
function mergeSameLogin(list: AgentUsage[]): AgentUsage[] {
  const out: AgentUsage[] = [];
  for (const item of list) {
    const same = item.email ? out.find((o) => o.kind === item.kind && o.email === item.email) : undefined;
    if (same) same.label = `${same.label}, ${item.label}`;
    else out.push({ ...item });
  }
  return out;
}

export function AgentPlanUsage() {
  const { kodeProviders } = useAppSettings();
  const accounts = kodeProviders
    .filter((p) => p.enabled)
    .map(usageAccount)
    .filter((a): a is UsageAccount => a !== null);
  const accountsKey = JSON.stringify(accounts);
  // The last answers (also read by the context popover) show at once.
  const [usage, setUsage] = useState<AgentUsage[] | null>(() => {
    const cached = accounts.map((a) => cachedAgentUsage(a.id));
    return cached.every((u) => u !== undefined) ? cached.filter((u): u is AgentUsage => u !== null) : null;
  });
  const [loading, setLoading] = useState(false);
  const dashboards = kodeProviders
    .filter((p) => p.enabled)
    .map(usageDashboard)
    .filter((d, i, all): d is { name: string; url: string } => d !== null && all.findIndex((o) => o?.name === d.name) === i);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsage(await readAgentUsage(accounts));
    } catch {
      setUsage([]);
    } finally {
      setLoading(false);
    }
  }, [accountsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (accounts.length === 0 && dashboards.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-lead font-semibold">Your own plans</h2>
          <p className="text-label text-muted-foreground">
            The Claude and ChatGPT plans you pay for directly, asked from Claude Code and Codex on this Mac. Checking
            doesn't use any of them. Separate from your plan above: models you use through Kontinue or Kode never count toward these.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex shrink-0 cursor-pointer items-center gap-1 text-label text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>

      {usage === null ? (
        <p className="flex items-center gap-2 text-label text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Reading your agents' usage…
        </p>
      ) : (
        mergeSameLogin(usage).map((account) => (
          <div key={account.id} className="liquid-glass-dropdown space-y-3 !rounded-[20px] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="kontinue-3d flex size-7 shrink-0 items-center justify-center rounded-full">
                <ModelSelectorLogo provider={LOGO[account.kind]} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-body font-medium text-foreground/90">
                  {account.label}
                  {account.plan ? (
                    <span className="rounded-full border border-black/10 px-1.5 py-px text-micro font-normal capitalize text-muted-foreground dark:border-white/10">
                      {account.plan}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {[
                    account.email,
                    account.live ? "live" : account.asOf ? `last saved ${formatActivity(account.asOf)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || (account.kind === "claude" ? "Claude Code" : "Codex")}
                </span>
              </span>
            </div>
            {account.limits.length ? (
              account.limits.map((limit) => {
                const pct = Math.max(0, Math.min(100, Math.round(limit.percent)));
                return (
                  <div key={limit.label} className="grid grid-cols-[minmax(0,200px)_1fr_64px] items-center gap-6">
                    <div className="min-w-0">
                      <p className="truncate text-body text-foreground/90">{limit.label}</p>
                      <p className="truncate text-label text-muted-foreground">
                        {limit.resetsAt ? (limit.resetsAt < Date.now() ? "Reset since then" : formatReset(limit.resetsAt)) : " "}
                      </p>
                    </div>
                    <UsageBar pct={limit.resetsAt && limit.resetsAt < Date.now() ? 0 : pct} className="h-2" />
                    <span className="text-right text-label tabular-nums text-muted-foreground">
                      {limit.resetsAt && limit.resetsAt < Date.now() ? 0 : pct}% used
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-label text-muted-foreground">{account.note ?? "No usage recorded yet."}</p>
            )}
          </div>
        ))
      )}

      {dashboards.length ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted-foreground">
          <span>{dashboards.map((d) => d.name).join(" and ")} keep usage on their websites:</span>
          {dashboards.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => void openUrl(d.url)}
              className="flex cursor-pointer items-center gap-1 text-foreground/80 hover:text-foreground"
            >
              {d.name} <ExternalLink size={10} />
            </button>
          ))}
        </p>
      ) : null}
    </section>
  );
}
