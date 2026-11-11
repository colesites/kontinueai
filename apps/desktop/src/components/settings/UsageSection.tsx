import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader2, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { api, chatUsageApi } from "@/lib/convex-api";
import { updateSettings } from "@/lib/app-settings";
import { formatReset, UsageBar, usagePercent } from "@/components/usage/KodeUsageCard";
import { getKodeModelById, KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { CREDIT_PACKS, creditPackMicros } from "@repo/ai/lib/kode-usage";
import { cn } from "@/lib/utils";
import { AgentPlanUsage } from "./AgentPlanUsage";
import { CreditCheckoutDialog } from "./CreditCheckoutDialog";

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
  const [checkoutPack, setCheckoutPack] = useState<{ id: string; label: string } | null>(null);
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
    return <p className="text-body text-muted-foreground">Sign in to see your usage.</p>;
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

  const limitValid = limitDraft.trim() !== "" && Number.isFinite(Number(limitDraft)) && Number(limitDraft) >= 0;
  const saveLimit = async () => {
    if (!limitValid) return;
    await setCreditSettings({ monthlyLimitMicros: Math.round(Number(limitDraft) * 1_000_000) });
    setEditingLimit(false);
  };

  const maxDay = Math.max(...derived.days, 1);
  const maxCell = Math.max(...derived.grid.flat(), 1);
  const creditPct = usagePercent(usage.credits.monthSpent, usage.credits.monthlyLimit);

  return (
    <div className="space-y-8">
      {showPace ? (
        <section>
          <h2 className="text-lead font-semibold">
            Heads up. At this pace you'll run out{" "}
            {runOutDate.toLocaleDateString([], { weekday: "long" })} {partOfDay(runOutDate.getHours())},
            before this week's reset.
          </h2>
          {topModelInfo && topModelInfo.id !== KODE_MODEL_ID && topShare >= 40 ? (
            <p className="mt-1.5 text-body leading-relaxed text-muted-foreground">
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
            className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-4 text-label font-medium"
          >
            Upgrade plan
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => document.getElementById("usage-credits")?.scrollIntoView({ behavior: "smooth" })}
          className="kontinue-3d h-8 cursor-pointer rounded-full px-4 text-label text-foreground/85 hover:text-foreground"
        >
          Buy usage credits · Up to 15% bonus
        </button>
      </div>

      <section className="space-y-5">
        <div>
          <SectionTitle>Your plan</SectionTitle>
          <p className="text-label text-muted-foreground">
            One subscription covers Kontinue and Kode. Each has its own limits.
          </p>
        </div>
        <ChatUsage />
        <SubTitle title="Kode" detail="Coding in the Kode tab, with any model you pick there, including GPT and Claude models." />
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
          <p className="text-label text-muted-foreground">
            After a limit, Kode 1.0 keeps working from a separate weekly allowance (
            {usagePercent(usage.relaxed.used, usage.relaxed.limit)}% used).
          </p>
        ) : null}
      </section>

      <Divider />

      <section>
        <SectionTitle>Kode this week</SectionTitle>
        <p className="mb-4 text-label text-muted-foreground">Share of your Kode usage by day</p>
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
                <span className={cn("text-caption", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {DAYS[index]}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 space-y-3">
          {history.models.length === 0 ? (
            <p className="text-label text-muted-foreground">No Kode usage yet this week.</p>
          ) : (
            history.models.slice(0, 6).map((model) => {
              const pct = derived.total > 0 ? Math.round((model.micros / derived.total) * 100) : 0;
              return (
                <div key={model.modelId} className="grid grid-cols-[140px_1fr_44px] items-center gap-4">
                  <span className="truncate text-body text-foreground/90">
                    {getKodeModelById(model.modelId)?.name ?? model.modelId}
                  </span>
                  <UsageBar pct={pct} />
                  <span className="text-right text-label tabular-nums text-muted-foreground">{pct}%</span>
                </div>
              );
            })
          )}
          <button
            type="button"
            onClick={onOpenModels}
            className="cursor-pointer text-label text-muted-foreground hover:text-foreground"
          >
            Using your own API keys doesn't count toward these limits →
          </button>
        </div>
      </section>

      <Divider />

      <section>
        <SectionTitle>Your Kode week</SectionTitle>
        <p className="mb-4 text-body text-muted-foreground">
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
              <span className="w-9 shrink-0 text-caption text-muted-foreground">{DAYS[day]}</span>
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
          <div className="flex pl-10 text-micro text-muted-foreground">
            <span className="flex-1">12 AM</span>
            <span className="flex-1">6 AM</span>
            <span className="flex-1">12 PM</span>
            <span className="flex-1">6 PM</span>
          </div>
        </div>
        <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
          Each cell is one hour in your local time, shaded by how much Kode usage you had compared
          with your busiest hour.
        </p>
      </section>

      <Divider />

      <section id="usage-credits" className="space-y-5">
        <SectionTitle>Usage credits</SectionTitle>
        <div className="flex items-center justify-between gap-6">
          <p className="text-body text-muted-foreground">
            Available for any Kode model. Never expire when your limits reset.
          </p>
          <span className="text-[16px] font-semibold tabular-nums">{usd(usage.credits.balance)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <p className="text-body text-foreground/90">
            Keep using Kode with credits when you hit a plan limit.
          </p>
          <Switch
            checked={usage.credits.autoUse}
            onCheckedChange={(checked) => void setCreditSettings({ autoUse: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-lead font-semibold tabular-nums">{usd(usage.credits.monthlyLimit)}</p>
            <p className="text-label text-muted-foreground">Monthly credit spend limit</p>
          </div>
          <PillButton
            onClick={() => {
              setLimitDraft(String(Math.round(usage.credits.monthlyLimit / 1_000_000)));
              setEditingLimit(true);
            }}
          >
            Adjust limit
          </PillButton>
        </div>
        <Dialog open={editingLimit} onOpenChange={setEditingLimit}>
          <DialogContent
            title="Monthly credit spend limit"
            description="The most Kode can spend from your credits in a month once you hit a plan limit. Set 0 to never use credits."
            size="sm"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveLimit();
              }}
            >
              <DialogBody>
                <label className="kontinue-3d flex h-10 items-center gap-1.5 rounded-full px-4 focus-within:ring-1 focus-within:ring-purple-500/40">
                  <span className="text-body text-muted-foreground">$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={limitDraft}
                    onChange={(e) => setLimitDraft(e.target.value.replace(/[^\d.]/g, ""))}
                    aria-label="Monthly limit in dollars"
                    className="min-w-0 flex-1 bg-transparent text-body tabular-nums outline-none"
                  />
                  <span className="text-label text-muted-foreground">per month</span>
                </label>
                <p className="mt-2 text-caption text-muted-foreground">
                  {usd(usage.credits.monthSpent)} spent so far this month.
                </p>
              </DialogBody>
              <DialogFooter>
                <PillButton onClick={() => setEditingLimit(false)}>Cancel</PillButton>
                <button
                  type="submit"
                  disabled={!limitValid}
                  className="kontinue-3d-primary flex h-8 cursor-pointer items-center rounded-full px-3.5 text-label font-medium disabled:opacity-40"
                >
                  Save
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <MeterRow
          label={`${usd(usage.credits.monthSpent)} spent`}
          detail={`Resets ${new Date(usage.credits.monthResetAt).toLocaleDateString([], { month: "short", day: "numeric" })}`}
          pct={creditPct}
        />
        <div>
          <p className="mb-2 text-body text-foreground/90">Buy usage credits</p>
          <div className="flex flex-wrap gap-2">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() =>
                  setCheckoutPack({
                    id: pack.id,
                    label:
                      pack.bonusPercent > 0
                        ? `$${pack.priceCents / 100} for ${usd(creditPackMicros(pack))} of usage, including a ${pack.bonusPercent}% bonus.`
                        : `$${pack.priceCents / 100} of usage.`,
                  })
                }
                className="kontinue-3d flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-label text-foreground/90"
              >
                <span className="font-semibold">${pack.priceCents / 100}</span>
                {pack.bonusPercent > 0 ? (
                  <span className="text-caption text-emerald-500">
                    +{pack.bonusPercent}% · {usd(creditPackMicros(pack))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            Pay securely with Stripe without leaving Kontinue. Credits appear here once payment completes.
          </p>
          <CreditCheckoutDialog pack={checkoutPack} onClose={() => setCheckoutPack(null)} />
        </div>
      </section>

      <Divider />

      <AgentPlanUsage />

      <Divider />

      <div className="flex items-center justify-between text-label text-muted-foreground">
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
        <p className="truncate text-body text-foreground/90">{label}</p>
        <p className="truncate text-label text-muted-foreground">{detail}</p>
      </div>
      <UsageBar pct={pct} className="h-2" />
      <span className="text-right text-label tabular-nums text-muted-foreground">{pct}% used</span>
    </div>
  );
}

function SubTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="pt-1">
      <p className="text-body font-semibold text-foreground/90">{title}</p>
      <p className="text-label text-muted-foreground">{detail}</p>
    </div>
  );
}

/** Kontinue chat (Home in this app, the web and mobile) counts requests per month (messages.getMonthlyUsage). */
function ChatUsage() {
  const usage = useQuery(chatUsageApi.messages.getMonthlyUsage, {});
  if (!usage) return null;
  const now = new Date();
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const rows: { label: string; used: number; limit: number }[] = [
    { label: "K-AI 1.0", used: usage.kaiUsed, limit: usage.kaiLimit },
    { label: "Standard models", used: usage.paidStandardUsed, limit: usage.paidStandardLimit },
    { label: "Pro models", used: usage.paidPremiumUsed, limit: usage.paidPremiumLimit },
    { label: "Frontier models", used: usage.frontierUsed, limit: usage.frontierLimit },
    { label: "Automatic imports", used: usage.monthlyImportUsed, limit: usage.monthlyImportLimit },
  ].filter((row) => row.limit > 0);
  if (!rows.length) return null;
  return (
    <>
      <SubTitle title="Kontinue" detail={`Chat in Home here, on the web and on mobile. Requests this month. ${formatReset(resetAt)}.`} />
      {rows.map((row) => (
        <MeterRow
          key={row.label}
          label={row.label}
          detail={`${row.used.toLocaleString()} of ${row.limit.toLocaleString()}`}
          pct={usagePercent(row.used, row.limit)}
        />
      ))}
    </>
  );
}


function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 text-lead font-semibold">{children}</h2>;
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
        "h-8 cursor-pointer rounded-full px-3.5 text-label font-medium",
        primary ? "kontinue-3d-primary" : "kontinue-3d text-foreground/85 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
