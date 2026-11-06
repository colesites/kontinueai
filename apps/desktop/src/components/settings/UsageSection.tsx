import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/convex-api";
import { getSessionToken } from "@/lib/kode-chat";
import { updateSettings } from "@/lib/app-settings";
import { formatReset, UsageBar, usagePercent } from "@/components/usage/KodeUsageCard";
import { getKodeModelById, KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { CREDIT_PACKS, creditPackMicros } from "@repo/ai/lib/kode-usage";
import { cn } from "@/lib/utils";

const PRICING_URL = "https://chat.kontinueai.com/pricing";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

function openExternal(url: string) {
  void openUrl(url).catch(() => window.open(url, "_blank"));
}

/** Local weekday index with Monday = 0. */
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

function partOfDay(hour: number) {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function UsageSection({ onOpenModels }: { onOpenModels: () => void }) {
  const usage = useQuery(api.kodeUsage.getUsage, {});
  const history = useQuery(api.kodeUsage.getUsageHistory, {});
  const setCreditSettings = useMutation(api.kodeUsage.setCreditSettings);
  const [checkoutPack, setCheckoutPack] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState("");

  const derived = useMemo(() => {
    if (!history) return null;
    const days = Array.from({ length: 7 }, () => 0);
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const hour of history.hours) {
      const date = new Date(hour.hourStartMs);
      days[weekdayIndex(date)] += hour.micros;
      grid[weekdayIndex(date)][date.getHours()] += hour.micros;
    }
    let peak = { day: -1, hour: -1, micros: 0 };
    grid.forEach((row, day) =>
      row.forEach((micros, hour) => {
        if (micros > peak.micros) peak = { day, hour, micros };
      }),
    );
    const total = history.models.reduce((sum, model) => sum + model.micros, 0);
    return { days, grid, peak, total };
  }, [history]);

  if (usage === undefined || history === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!usage || !history || !derived) {
    return <p className="text-[12.5px] text-muted-foreground">Sign in to see your usage.</p>;
  }

  // Pace: at this week's rate, when would the weekly limit run out?
  const now = Date.now();
  const weekStart = usage.weekly.resetAt - 7 * 86_400_000;
  const elapsed = Math.max(now - weekStart, 3_600_000);
  const rate = usage.weekly.used / elapsed;
  const runOutAt = rate > 0 ? weekStart + usage.weekly.limit / rate : Infinity;
  const topModel = history.models[0];
  const topShare = topModel && derived.total > 0 ? Math.round((topModel.micros / derived.total) * 100) : 0;
  const topModelInfo = topModel ? getKodeModelById(topModel.modelId) : undefined;
  const showPace =
    usage.weekly.used >= usage.weekly.limit * 0.15 &&
    runOutAt < usage.weekly.resetAt &&
    usage.weekly.used < usage.weekly.limit;
  const runOutDate = new Date(runOutAt);

  const startCheckout = async (packId: string) => {
    setCheckoutPack(packId);
    setCheckoutError(null);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error("Your session expired. Sign in again.");
      const result = await invoke<{ url: string }>("kontinue_api_post", {
        path: "/api/billing/credits/checkout",
        sessionToken: token,
        body: { packId },
      });
      openExternal(result.url);
    } catch (error) {
      setCheckoutError(typeof error === "string" ? error : error instanceof Error ? error.message : "Couldn't start checkout.");
    } finally {
      setCheckoutPack(null);
    }
  };

  const saveLimit = async () => {
    const dollars = Number(limitDraft);
    if (!Number.isFinite(dollars) || dollars < 0) return;
    await setCreditSettings({ monthlyLimitMicros: Math.round(dollars * 1_000_000) });
    setEditingLimit(false);
  };

  const maxDay = Math.max(...derived.days, 1);
  const maxCell = Math.max(...derived.grid.flat(), 1);
  const creditPct = usagePercent(usage.credits.monthSpent, usage.credits.monthlyLimit);

  return (
    <div className="space-y-8">
      {showPace ? (
        <section>
          <h2 className="text-[14px] font-semibold">
            Heads up. At this pace you'll run out{" "}
            {runOutDate.toLocaleDateString([], { weekday: "long" })} {partOfDay(runOutDate.getHours())},
            before this week's reset.
          </h2>
          {topModelInfo && topModelInfo.id !== KODE_MODEL_ID && topShare >= 40 ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {topModelInfo.name} made up {topShare}% of your usage this week, and it draws down
              usage faster than lighter models. Using a lighter model for quick tasks can make
              your usage last the rest of the week.{" "}
              <button
                type="button"
                onClick={() => updateSettings({ defaultKodeModel: KODE_MODEL_ID })}
                className="cursor-pointer font-medium text-purple-500 hover:underline"
              >
                Use Kode 1.0 for new sessions
              </button>
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {usage.plan !== "max" ? (
          <button
            type="button"
            onClick={() => openExternal(PRICING_URL)}
            className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-4 text-[12px] font-medium"
          >
            Upgrade plan
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => document.getElementById("usage-credits")?.scrollIntoView({ behavior: "smooth" })}
          className="kontinue-3d h-8 cursor-pointer rounded-full px-4 text-[12px] text-foreground/85 hover:text-foreground"
        >
          Buy usage credits · Up to 15% bonus
        </button>
      </div>

      <section className="space-y-5">
        <MeterRow
          label="Current session"
          detail={usage.session.resetAt === null ? "Starts with your first message" : formatReset(usage.session.resetAt)}
          pct={usagePercent(usage.session.used, usage.session.limit)}
        />
        <MeterRow
          label="Weekly limit · All models"
          detail={formatReset(usage.weekly.resetAt)}
          pct={usagePercent(usage.weekly.used, usage.weekly.limit)}
        />
        {usage.relaxed.limit > 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            After a limit, Kode 1.0 keeps working from a separate weekly allowance (
            {usagePercent(usage.relaxed.used, usage.relaxed.limit)}% used).
          </p>
        ) : null}
      </section>

      <Divider />

      <section>
        <SectionTitle>This week</SectionTitle>
        <p className="mb-4 text-[11.5px] text-muted-foreground">Share of your usage by day</p>
        <div className="grid grid-cols-7 items-end gap-2">
          {derived.days.map((micros, index) => {
            const isToday = index === weekdayIndex(new Date());
            return (
              <div key={DAYS[index]} className="flex flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end">
                  <div
                    className={cn("w-full rounded-lg", micros > 0 ? "bg-purple-500/80" : "bg-black/[0.04] dark:bg-white/[0.04]")}
                    style={{ height: micros > 0 ? `${Math.max(8, (micros / maxDay) * 100)}%` : 6 }}
                  />
                </div>
                <span className={cn("text-[11px]", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {DAYS[index]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 space-y-3">
          {history.models.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No Kode usage yet this week.</p>
          ) : (
            history.models.slice(0, 6).map((model) => {
              const pct = derived.total > 0 ? Math.round((model.micros / derived.total) * 100) : 0;
              return (
                <div key={model.modelId} className="grid grid-cols-[140px_1fr_44px] items-center gap-4">
                  <span className="truncate text-[12.5px] text-foreground/90">
                    {getKodeModelById(model.modelId)?.name ?? model.modelId}
                  </span>
                  <UsageBar pct={pct} />
                  <span className="text-right text-[12px] tabular-nums text-muted-foreground">{pct}%</span>
                </div>
              );
            })
          )}
          <button
            type="button"
            onClick={onOpenModels}
            className="cursor-pointer text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Using your own API keys doesn't count toward these limits →
          </button>
        </div>
      </section>

      <Divider />

      <section>
        <SectionTitle>Your week</SectionTitle>
        <p className="mb-4 text-[12.5px] text-muted-foreground">
          {derived.peak.day >= 0 ? (
            <>
              Your heaviest stretch this week was{" "}
              <span className="font-medium text-foreground">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][derived.peak.day]}{" "}
                {partOfDay(derived.peak.hour)}
              </span>
              .
            </>
          ) : (
            "Your activity will show up here as you use Kode."
          )}
        </p>
        <div className="space-y-1">
          {derived.grid.map((row, day) => (
            <div key={DAYS[day]} className="flex items-center gap-1">
              <span className="w-9 shrink-0 text-[10.5px] text-muted-foreground">{DAYS[day]}</span>
              {row.map((micros, hour) => (
                <span
                  key={hour}
                  title={`${DAYS[day]} ${hour}:00 · ${usd(micros)}`}
                  className="h-4 flex-1 rounded-[4px] bg-black/[0.05] dark:bg-white/[0.05]"
                  style={micros > 0 ? { backgroundColor: `rgba(168, 85, 247, ${0.25 + 0.75 * (micros / maxCell)})` } : undefined}
                />
              ))}
            </div>
          ))}
          <div className="flex pl-10 text-[10px] text-muted-foreground">
            <span className="flex-1">12 AM</span>
            <span className="flex-1">6 AM</span>
            <span className="flex-1">12 PM</span>
            <span className="flex-1">6 PM</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Each cell is one hour in your local time, shaded by how much Kode usage you had compared
          with your busiest hour.
        </p>
      </section>

      <Divider />

      <section id="usage-credits" className="space-y-5">
        <SectionTitle>Usage credits</SectionTitle>
        <div className="flex items-center justify-between gap-6">
          <p className="text-[12.5px] text-muted-foreground">
            Available for any Kode model. Never expire when your limits reset.
          </p>
          <span className="text-[16px] font-semibold tabular-nums">{usd(usage.credits.balance)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <p className="text-[12.5px] text-foreground/90">
            Keep using Kode with credits when you hit a plan limit.
          </p>
          <Switch
            checked={usage.credits.autoUse}
            onCheckedChange={(checked) => void setCreditSettings({ autoUse: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            {editingLimit ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px]">$</span>
                <input
                  autoFocus
                  value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value.replace(/[^\d.]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && void saveLimit()}
                  className="kontinue-3d h-8 w-24 rounded-full px-3 text-[12.5px] outline-none"
                />
              </div>
            ) : (
              <p className="text-[14px] font-semibold tabular-nums">{usd(usage.credits.monthlyLimit)}</p>
            )}
            <p className="text-[11.5px] text-muted-foreground">Monthly credit spend limit</p>
          </div>
          {editingLimit ? (
            <div className="flex gap-1.5">
              <PillButton onClick={() => setEditingLimit(false)}>Cancel</PillButton>
              <PillButton primary onClick={() => void saveLimit()}>Save</PillButton>
            </div>
          ) : (
            <PillButton
              onClick={() => {
                setLimitDraft(String(Math.round(usage.credits.monthlyLimit / 1_000_000)));
                setEditingLimit(true);
              }}
            >
              Adjust limit
            </PillButton>
          )}
        </div>
        <MeterRow
          label={`${usd(usage.credits.monthSpent)} spent`}
          detail={`Resets ${new Date(usage.credits.monthResetAt).toLocaleDateString([], { month: "short", day: "numeric" })}`}
          pct={creditPct}
        />
        <div>
          <p className="mb-2 text-[12.5px] text-foreground/90">Buy usage credits</p>
          <div className="flex flex-wrap gap-2">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={checkoutPack !== null}
                onClick={() => void startCheckout(pack.id)}
                className="kontinue-3d flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-[12px] text-foreground/90 disabled:cursor-default disabled:opacity-60"
              >
                {checkoutPack === pack.id ? <Loader2 size={12} className="animate-spin" /> : null}
                <span className="font-semibold">${pack.priceCents / 100}</span>
                {pack.bonusPercent > 0 ? (
                  <span className="text-[11px] text-emerald-500">
                    +{pack.bonusPercent}% · {usd(creditPackMicros(pack))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {checkoutError ? <p className="mt-2 text-[11.5px] text-rose-400">{checkoutError}</p> : null}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Checkout opens in your browser. Credits appear here once payment completes.
          </p>
        </div>
      </section>

      <Divider />

      <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <RefreshCw size={11} /> Updates live
        </span>
        <button
          type="button"
          onClick={() => openExternal(PRICING_URL)}
          className="cursor-pointer text-purple-500 hover:underline"
        >
          Learn more about usage limits
        </button>
      </div>
    </div>
  );
}

function MeterRow({ label, detail, pct }: { label: string; detail: string; pct: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,200px)_1fr_64px] items-center gap-6">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] text-foreground/90">{label}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">{detail}</p>
      </div>
      <UsageBar pct={pct} className="h-2" />
      <span className="text-right text-[12px] tabular-nums text-muted-foreground">{pct}% used</span>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 text-[14px] font-semibold">{children}</h2>;
}

function Divider() {
  return <div className="h-px bg-black/[0.06] dark:bg-white/[0.06]" />;
}

function PillButton({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 cursor-pointer rounded-full px-3.5 text-[12px] font-medium",
        primary ? "kontinue-3d-primary" : "kontinue-3d text-foreground/85 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
