"use client";

import { type PlanTier, planLabel } from "@repo/core/plan-tier";
import { Progress } from "@repo/ui/components/ui/progress";
import type React from "react";

type MonthlyUsage = {
	planTier: PlanTier;
	isPaid: boolean;
	kaiUsed: number;
	kaiLimit: number | null;
	freeMonthlyUsed: number;
	freeMonthlyLimit: number;
	paidPremiumUsed: number;
	paidPremiumLimit: number;
	paidStandardUsed: number;
	paidStandardLimit: number;
	frontierUsed: number;
	frontierLimit: number;
	paidTotalUsed: number;
	paidTotalLimit: number;
	monthlyImportUsed: number;
	monthlyImportLimit: number | null;
} | null;

type SettingsUsagePanelProps = {
	usage: MonthlyUsage | undefined;
	aiUsage:
		| { used: number; limit: number; remaining: number; tier: PlanTier }
		| undefined;
};

function toProgress(used: number, limit: number): number {
	return limit > 0 ? (used / limit) * 100 : 0;
}

function KaiUsageSection({ usage }: { usage: NonNullable<MonthlyUsage> }) {
	const kaiUsed = usage.kaiUsed ?? 0;
	const kaiLimit = typeof usage.kaiLimit === "number" ? usage.kaiLimit : 0;

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
				<span className="font-medium">K-AI 1.0 Requests</span>
				<span className="tabular-nums text-muted-foreground">
					{kaiUsed} / {kaiLimit}
				</span>
			</div>
			<Progress value={toProgress(kaiUsed, kaiLimit)} className="h-2" />
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				K-AI has its own request ceiling. Shared AI usage credits apply only
				when a metered tool or paid fallback is used.
			</p>
		</div>
	);
}

function ImportUsageSection({ usage }: { usage: NonNullable<MonthlyUsage> }) {
	const monthlyImportUsed = usage.monthlyImportUsed ?? 0;
	const isUnlimited = usage.monthlyImportLimit === null;
	const monthlyImportLimit =
		typeof usage.monthlyImportLimit === "number" ? usage.monthlyImportLimit : 0;

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
				<span className="font-medium">Monthly Imports</span>
				<span className="tabular-nums text-muted-foreground">
					{monthlyImportUsed} / {isUnlimited ? "Unlimited" : monthlyImportLimit}
				</span>
			</div>
			{!isUnlimited && (
				<Progress
					value={toProgress(monthlyImportUsed, monthlyImportLimit)}
					className="h-2"
				/>
			)}
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{isUnlimited
					? "Unlimited under fair use; abuse-protection soft caps still apply."
					: "Monthly import limits reset at the start of each UTC month."}
			</p>
		</div>
	);
}

export function SettingsUsagePanel({
	usage,
	aiUsage,
}: SettingsUsagePanelProps): React.JSX.Element {
	if (!usage || !aiUsage) {
		return (
			<div className="flex items-center justify-center py-4">
				<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (!usage.isPaid) {
		return (
			<div className="space-y-6">
				<div className="space-y-2">
					<div className="flex justify-between gap-3 text-sm">
						<span className="font-medium">AI usage credits</span>
						<span className="tabular-nums text-muted-foreground">
							{aiUsage.used} / {aiUsage.limit}
						</span>
					</div>
					<Progress
						value={toProgress(aiUsage.used, aiUsage.limit)}
						className="h-2"
					/>
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						Shared by metered search, media, Live, Canvas AI actions, Kode AI
						runs, and paid-model work. Opening Canvas or Kode uses no credits.
					</p>
				</div>
				<KaiUsageSection usage={usage} />
				<ImportUsageSection usage={usage} />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<div className="flex justify-between gap-3 text-sm">
					<span className="font-medium">AI usage credits</span>
					<span className="tabular-nums text-muted-foreground">
						{aiUsage.used} / {aiUsage.limit}
					</span>
				</div>
				<Progress
					value={toProgress(aiUsage.used, aiUsage.limit)}
					className="h-2"
				/>
				<p className="text-[11px] leading-relaxed text-muted-foreground">
					{aiUsage.remaining.toLocaleString()} credits remain across chat,
					search, media, Live, Canvas AI actions, and Kode AI runs.
				</p>
			</div>
			<KaiUsageSection usage={usage} />
			<div className="space-y-2">
				<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
					<span className="font-medium">External model requests</span>
					<span className="tabular-nums text-muted-foreground">
						{usage.paidTotalUsed} / {usage.paidTotalLimit}
					</span>
				</div>
				<Progress
					value={toProgress(usage.paidTotalUsed, usage.paidTotalLimit)}
					className="h-2"
				/>
			</div>

			<div className="space-y-2">
				<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
					<span className="font-medium">Basic-model requests</span>
					<span className="tabular-nums text-muted-foreground">
						{usage.paidStandardUsed} / {usage.paidStandardLimit}
					</span>
				</div>
				<Progress
					value={toProgress(usage.paidStandardUsed, usage.paidStandardLimit)}
					className="h-2"
				/>
			</div>

			{usage.paidPremiumLimit > 0 ? (
				<div className="space-y-2">
					<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
						<span className="font-medium text-violet-300">
							Pro-model requests
						</span>
						<span className="tabular-nums text-muted-foreground">
							{usage.paidPremiumUsed} / {usage.paidPremiumLimit}
						</span>
					</div>
					<Progress
						value={toProgress(usage.paidPremiumUsed, usage.paidPremiumLimit)}
						className="h-2 bg-violet-500/15 shadow-[0_0_14px_rgba(139,92,246,0.35)] [&_[data-slot=progress-indicator]]:bg-violet-400"
					/>
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						Current plan: {planLabel(usage.planTier)}.
					</p>
				</div>
			) : null}

			{usage.frontierLimit > 0 ? (
				<div className="space-y-2">
					<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
						<span className="font-medium text-amber-300">
							Frontier-model requests
						</span>
						<span className="tabular-nums text-muted-foreground">
							{usage.frontierUsed} / {usage.frontierLimit}
						</span>
					</div>
					<Progress
						value={toProgress(usage.frontierUsed, usage.frontierLimit)}
						className="h-2 bg-amber-400/15 shadow-[0_0_14px_rgba(251,191,36,0.3)] [&_[data-slot=progress-indicator]]:bg-amber-400"
					/>
				</div>
			) : null}

			<ImportUsageSection usage={usage} />
		</div>
	);
}
