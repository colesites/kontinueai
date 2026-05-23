"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ChevronUp, Sparkles } from "lucide-react";
import { IoSettingsSharp } from "react-icons/io5";
import { LuMessageSquarePlus } from "react-icons/lu";
import { SidebarFooter } from "@repo/ui/components/ui/sidebar";
import { planLabel, type PlanTier } from "@repo/core/plan-tier";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";

type SidebarAccountSectionProps = {
  displayName: string;
  userEmail: string;
  userInitial: string;
  userImageUrl?: string;
  planTier: PlanTier;
  onNavigate: () => void;
};

export function SidebarAccountSection({
  displayName,
  userEmail,
  userInitial,
  userImageUrl,
  planTier,
  onNavigate,
}: SidebarAccountSectionProps) {
  const isPaid = planTier !== "free";
  const isTopTier = planTier === "pro";
  const feedbackHref = "/feedback";

  return (
    <SidebarFooter className="border-t border-foreground/6 -mx-2 px-3 py-2.5 gap-0">
      {/* Account pill — minimal one-line layout */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0",
              "hover:bg-foreground/5",
              "data-[state=open]:bg-foreground/6"
            )}
          >
            {userImageUrl ? (
              <span
                className="size-7 shrink-0 rounded-full ring-1 ring-foreground/10 bg-cover bg-center"
                style={{ backgroundImage: `url(${userImageUrl})` }}
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary/25 to-primary/10 text-[11px] font-semibold text-primary ring-1 ring-primary/25">
                {userInitial.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
                {displayName || "Logged in"}
              </p>
            </div>
            {!isTopTier && (
              <span className="shrink-0 rounded-full bg-primary/12 ring-1 ring-primary/25 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary">
                {planTier === "free" ? "Free" : planLabel(planTier)}
              </span>
            )}
            {isPaid && isTopTier && (
              <span className="shrink-0 rounded-full bg-linear-to-br from-primary/25 to-primary/10 ring-1 ring-primary/30 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary shadow-[0_0_8px_-2px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
                Pro
              </span>
            )}
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className={cn(
            "glass bg-background/40 backdrop-blur-3xl rounded-2xl p-2 border-foreground/10",
            "w-(--radix-dropdown-menu-trigger-width) min-w-(--radix-dropdown-menu-trigger-width)",
            "**:data-[slot=dropdown-menu-item]:rounded-lg **:data-[slot=dropdown-menu-item]:px-2.5 **:data-[slot=dropdown-menu-item]:py-2 **:data-[slot=dropdown-menu-item]:cursor-pointer",
            "**:data-[slot=dropdown-menu-item]:focus:bg-foreground/6 **:data-[slot=dropdown-menu-item]:focus:text-foreground"
          )}
        >
          {/* Identity card */}
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium leading-tight text-foreground">
                {displayName || "Logged in"}
              </p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground/70 mt-0.5">
                {userEmail || "Account"}
              </p>
            </div>
            {isPaid && (
              <span className="shrink-0 rounded-full bg-linear-to-br from-primary/20 to-primary/8 ring-1 ring-primary/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                {planLabel(planTier)}
              </span>
            )}
          </div>

          <DropdownMenuSeparator className="my-1.5 bg-foreground/8" />

          <DropdownMenuItem asChild>
            <Link
              href="/settings"
              onClick={onNavigate}
              className="flex items-center gap-2.5"
            >
              <span className="flex size-6 items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground">
                <IoSettingsSharp className="size-3" />
              </span>
              <span className="text-[13px] font-medium">Settings</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={feedbackHref}
              onClick={onNavigate}
              className="flex items-center gap-2.5"
            >
              <span className="flex size-6 items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground">
                <LuMessageSquarePlus className="size-3" />
              </span>
              <span className="text-[13px] font-medium">Feedback</span>
            </Link>
          </DropdownMenuItem>

          {!isTopTier && (
            <>
              <DropdownMenuSeparator className="my-1.5 bg-foreground/8" />
              <DropdownMenuItem asChild>
                <Link
                  href="/pricing"
                  onClick={onNavigate}
                  className="flex items-center gap-2.5"
                >
                  <span className="flex size-6 items-center justify-center rounded-lg bg-linear-to-br from-primary/25 to-primary/10 text-primary ring-1 ring-primary/25 shadow-[0_2px_6px_-2px_color-mix(in_oklch,var(--primary)_45%,transparent)]">
                    <Sparkles className="size-3" />
                  </span>
                  <span className="flex-1 text-[13px] font-semibold text-primary">
                    {planTier === "starter" ? "Upgrade to Pro" : "Upgrade"}
                  </span>
                  <span className="text-primary/60">→</span>
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
}
