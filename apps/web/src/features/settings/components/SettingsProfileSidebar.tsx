"use client";

import { type PlanTier, planLabel } from "@repo/core/plan-tier";
import { Sparkles } from "lucide-react";
import Link from "next/link";

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
		<aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-8 lg:grid-cols-1 lg:self-start">
			<div className="surface-card relative overflow-hidden rounded-2xl p-4 sm:p-6">
				{/* soft top bloom */}
				<div className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-primary/10 blur-3xl" />
				<div className="relative flex items-center gap-4 text-left sm:flex-col sm:text-center">
					<span className="rounded-full bg-primary/15 p-1 shadow-[0_0_24px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent)] ring-1 ring-primary/25">
						{imageUrl ? (
							<span
								className="block size-16 rounded-full bg-cover bg-center sm:size-24"
								style={{ backgroundImage: `url(${imageUrl})` }}
							/>
						) : (
							<span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary sm:size-24 sm:text-4xl">
								{userInitial}
							</span>
						)}
					</span>
					<div className="min-w-0 flex-1 sm:w-full">
						<p className="text-lg font-semibold tracking-tight sm:mt-4 sm:text-xl">
							{displayName}
						</p>
						<p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
							{userEmail}
						</p>
						<span
							className={`mt-3.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
								isPaidPlan
									? "bg-primary/15 text-primary ring-1 ring-primary/25"
									: "surface-inset text-muted-foreground"
							}`}
						>
							{isPaidPlan && <Sparkles className="size-3" />}
							{planLabel(currentPlanTier)} Plan
						</span>
					</div>
				</div>
			</div>

			<div className="surface-card rounded-2xl p-4 sm:p-5">
				<p className="text-sm font-semibold text-foreground">Current plan</p>
				<p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
					{currentPlanTier === "pro"
						? "You have the highest limits, premium models, and extended token caps."
						: currentPlanTier === "starter"
							? "You have access to premium models and increased limits."
							: "You are on the free plan. Upgrade when you need more limits."}
				</p>
				{currentPlanTier !== "pro" && (
					<Link
						href="/pricing"
						className="glow-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-primary-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
					>
						<Sparkles className="size-4" />
						Upgrade plan
					</Link>
				)}
			</div>
		</aside>
	);
}
