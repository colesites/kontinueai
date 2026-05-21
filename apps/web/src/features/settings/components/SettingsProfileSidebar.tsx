"use client";

import Link from "next/link";
import { planLabel, type PlanTier } from "@repo/core/plan-tier";

type SettingsProfileSidebarProps = {
  imageUrl?: string;
  userInitial: string;
  displayName: string;
  userEmail: string;
  currentPlanTier: PlanTier;
};

export function SettingsProfileSidebar({
  imageUrl,
  userInitial,
  displayName,
  userEmail,
  currentPlanTier,
}: SettingsProfileSidebarProps) {
  const isPaidPlan = currentPlanTier !== "free";

  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-sm">
        <div className="flex flex-col items-center text-center">
          {imageUrl ? (
            <span
              className="h-28 w-28 rounded-full border border-border/70 bg-card/60 bg-cover bg-center"
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          ) : (
            <span className="flex h-28 w-28 items-center justify-center rounded-full border border-border/70 bg-primary/10 text-4xl font-semibold text-primary">
              {userInitial}
            </span>
          )}
          <p className="mt-4 text-2xl font-semibold tracking-tight">
            {displayName}
          </p>
          <p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
            {userEmail}
          </p>
          <span
            className={`mt-3 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${isPaidPlan
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/70 bg-background/70 text-muted-foreground"
              }`}
          >
            {planLabel(currentPlanTier)} Plan
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
        <p className="text-sm font-medium text-foreground">Current plan</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {currentPlanTier === "pro"
            ? "You have access to the highest limits, premium models, and extended token caps."
            : currentPlanTier === "starter"
              ? "You have access to premium models and increased limits."
              : "You are on the free plan. Upgrade when you need more limits."}
        </p>
        {currentPlanTier !== "pro" && (
          <Link
            href="/pricing"
            className="mt-3 inline-flex rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            View pricing
          </Link>
        )}
      </div>
    </aside>
  );
}
