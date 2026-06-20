import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type KodeUsageWindow } from "@/lib/convex-api";
import { useClerk, useUser } from "@clerk/clerk-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  CircleGauge,
  ExternalLink,
  LogOut,
  Settings,
  Smartphone,
  UserCircle,
} from "lucide-react";
import { useState } from "react";

// Where "Upgrade to Pro" sends the user. Lives on the web app's pricing page.
const UPGRADE_URL = "https://chat.kontinueai.com/pricing";

/** Percentage of a window's allowance still remaining (100 = untouched). */
function remainingPercent(window?: KodeUsageWindow): number {
  if (!window || window.limit <= 0) return 100;
  return Math.max(0, Math.round((1 - window.used / window.limit) * 100));
}

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

function UsageRow({
  label,
  window,
  resetFormat,
  loading,
}: {
  label: string;
  window?: KodeUsageWindow;
  resetFormat: (ms: number) => string;
  loading: boolean;
}) {
  const percent = remainingPercent(window);
  // Computed here (not at the call site) so a missing/undefined window can never
  // throw — keeps the menu safe even if the backend returns an unexpected shape.
  const reset = window ? resetFormat(window.resetAt) : "";

  // The bar shows REMAINING quota: full at the start of a window, shrinking toward
  // empty as tokens are consumed.
  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="flex items-center gap-3 text-foreground/55 tabular-nums">
          <span>{loading ? "—" : `${percent}%`}</span>
          <span className="min-w-[3.25rem] text-right">{loading ? "" : reset}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300"
          style={{ width: `${loading ? 0 : percent}%` }}
        />
      </div>
    </div>
  );
}

const LeftSidebarFooter = () => {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "Signed in";

  const usage = useQuery(api.kode.getUsage, {});
  const usageLoading = usage === undefined;
  const [usageOpen, setUsageOpen] = useState(false);

  return (
    <div className="px-3 pt-2 pb-3">
      <DropdownMenu onOpenChange={(open) => !open && setUsageOpen(false)}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="surface-raised flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-foreground transition-colors duration-150 hover:bg-white/[0.06] active:scale-[0.99]"
          >
            <Settings size={17} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Settings</span>
            <Smartphone size={16} className="shrink-0 text-foreground/45" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/[0.08] bg-[oklch(0.2_0.004_260)] p-2 shadow-2xl"
        >
          <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 text-foreground/58 text-sm">
            <UserCircle size={18} />
            <span className="min-w-0 truncate">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 text-foreground/58 text-sm">
            <Settings size={18} />
            <span>Personal account</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-2 bg-white/[0.08]" />
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={() => openUserProfile()}
          >
            <UserCircle size={18} />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={() => openUserProfile()}
          >
            <Settings size={18} />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-2 bg-white/[0.08]" />
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={(event) => {
              // Keep the menu open and toggle the inline usage breakdown.
              event.preventDefault();
              setUsageOpen((open) => !open);
            }}
          >
            <CircleGauge size={18} />
            <span>Usage remaining</span>
            {usageOpen ? (
              <ChevronDown size={18} className="ml-auto text-foreground/45" />
            ) : (
              <ChevronRight size={18} className="ml-auto text-foreground/45" />
            )}
          </DropdownMenuItem>
          {usageOpen && (
            <div className="pb-1">
              <UsageRow
                label="Daily"
                window={usage?.daily}
                resetFormat={formatTime}
                loading={usageLoading}
              />
              <UsageRow
                label="Weekly"
                window={usage?.weekly}
                resetFormat={formatDate}
                loading={usageLoading}
              />
              {usage && usage.plan !== "pro" && (
                <DropdownMenuItem
                  className="py-2.5 text-base"
                  onSelect={() => void openUrl(UPGRADE_URL)}
                >
                  <span>Upgrade to Pro</span>
                  <ExternalLink size={16} className="ml-auto text-foreground/45" />
                </DropdownMenuItem>
              )}
            </div>
          )}
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={() => void signOut()}
          >
            <LogOut size={18} />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default LeftSidebarFooter;
