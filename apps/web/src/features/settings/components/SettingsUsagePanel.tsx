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
	paidTotalUsed: number;
	paidTotalLimit: number;
	monthlyImportUsed: number;
	monthlyImportLimit: number | null;
} | null;

type SettingsUsagePanelProps = {
	usage: MonthlyUsage | undefined;
};

function toProgress(used: number, limit: number): number {
	return limit > 0 ? (used / limit) * 100 : 0;
}

function KaiUsageSection({ usage }: { usage: NonNullable<MonthlyUsage> }) {
	const kaiUsed = usage.kaiUsed ?? 0;
	const isUnlimited = usage.kaiLimit === null;
	const kaiLimit = typeof usage.kaiLimit === "number" ? usage.kaiLimit : 0;

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
				<span className="font-medium">K-AI 1.0 Requests</span>
				<span className="tabular-nums text-muted-foreground">
					{kaiUsed} / {isUnlimited ? "Unlimited" : kaiLimit}
				</span>
			</div>
			{!isUnlimited && (
				<Progress value={toProgress(kaiUsed, kaiLimit)} className="h-2" />
			)}
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{isUnlimited
					? "Pro plan includes unlimited K-AI 1.0 requests per month."
					: "K-AI 1.0 has its own monthly request budget, separate from other models. Resets at the start of each UTC month."}
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
					? "Pro plan includes unlimited imports per month."
					: "Monthly import limits reset at the start of each UTC month."}
			</p>
		</div>
	);
}

export function SettingsUsagePanel({
	usage,
}: SettingsUsagePanelProps): React.JSX.Element {
	if (!usage) {
		return (
			<div className="flex items-center justify-center py-4">
				<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (!usage.isPaid) {
		return (
			<div className="space-y-6">
				<KaiUsageSection usage={usage} />
				<div className="space-y-2">
					<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
						<span className="font-medium">Free Model Messages</span>
						<span className="tabular-nums text-muted-foreground">
							{usage.freeMonthlyUsed} / {usage.freeMonthlyLimit}
						</span>
					</div>
					<Progress
						value={toProgress(usage.freeMonthlyUsed, usage.freeMonthlyLimit)}
						className="h-2"
					/>
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						Upgrade to Starter or Pro for higher limits and premium models.
					</p>
				</div>
				<ImportUsageSection usage={usage} />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<KaiUsageSection usage={usage} />
			<div className="space-y-2">
				<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
					<span className="font-medium">Total Messages</span>
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
					<span className="font-medium">Standard Model Messages</span>
					<span className="tabular-nums text-muted-foreground">
						{usage.paidStandardUsed} / {usage.paidStandardLimit}
					</span>
				</div>
				<Progress
					value={toProgress(usage.paidStandardUsed, usage.paidStandardLimit)}
					className="h-2"
				/>
			</div>

			<div className="space-y-2">
				<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
					<span className="font-medium">Premium Model Messages</span>
					<span className="tabular-nums text-muted-foreground">
						{usage.paidPremiumUsed} / {usage.paidPremiumLimit}
					</span>
				</div>
				<Progress
					value={toProgress(usage.paidPremiumUsed, usage.paidPremiumLimit)}
					className="h-2 shadow-[0_0_10px_-2px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
				/>
				<p className="text-[11px] leading-relaxed text-muted-foreground">
					Premium models include image generation, web search, and reasoning.
					Current paid tier:{" "}
					{planLabel(usage.planTier === "pro" ? "pro" : "starter")} Plan.
				</p>
			</div>

			<ImportUsageSection usage={usage} />
		</div>
	);
}
