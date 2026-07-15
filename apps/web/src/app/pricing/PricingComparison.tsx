"use client";

import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import {
	getImportUploadLimitBytes,
	PLAN_TIERS,
	type PlanTier,
} from "@repo/core/plan-tier";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { Check, CircleHelp } from "lucide-react";
import { Fragment, type ReactNode } from "react";

type Value = string | boolean;
type Row = {
	label: string;
	description?: string;
	values: Record<PlanTier, Value>;
};

const tiers = [...PLAN_TIERS];

function values(mapper: (tier: PlanTier) => Value): Record<PlanTier, Value> {
	return Object.fromEntries(
		tiers.map((tier) => [tier, mapper(tier)]),
	) as Record<PlanTier, Value>;
}

function count(value: number): string {
	return value.toLocaleString("en-US");
}

function bytes(value: number): string {
	if (value >= 1024 ** 3) return `${value / 1024 ** 3} GB`;
	if (value >= 1024 ** 2) return `${value / 1024 ** 2} MB`;
	return `${value / 1024} KB`;
}

function requestValue(
	tier: PlanTier,
	group: "kai" | "basic" | "pro" | "frontier",
) {
	const limit = PLAN_DEFINITIONS[tier].monthlyRequests[group];
	return limit === 0 ? "Not included" : `${count(limit)}/month`;
}

function contextValue(
	tier: PlanTier,
	group: "kai" | "basic" | "pro" | "frontier",
) {
	const plan = PLAN_DEFINITIONS[tier];
	const context = plan.contextTokens[group];
	if (context === 0) return "Not included";
	return `${context / 1000}K / ${plan.maxOutputTokens[group] / 1000}K`;
}

const sections: Array<{ title: string; rows: Row[] }> = [
	{
		title: "AI and models",
		rows: [
			{
				label: "K-AI requests",
				description:
					"Monthly requests to Kontinue’s native intelligence layer.",
				values: values((tier) => requestValue(tier, "kai")),
			},
			{
				label: "Basic-model requests",
				description:
					"Fast, cost-efficient models for everyday writing, analysis, coding, and multimodal work.",
				values: values((tier) => requestValue(tier, "basic")),
			},
			{
				label: "Pro-model requests",
				description:
					"Higher-capability GPT, Claude, Gemini, Perplexity, and other supported models.",
				values: values((tier) => requestValue(tier, "pro")),
			},
			{
				label: "Frontier-model requests",
				description:
					"The highest-cost, most capable included models. Availability can change as providers reprice or retire models.",
				values: values((tier) => requestValue(tier, "frontier")),
			},
			{
				label: "AI usage credits",
				description:
					"Shared metering for paid chat work, web search, K-Image, K-Video, Live, Canvas AI actions, and Kode AI runs. Opening Canvas or Kode does not use credits.",
				values: values((tier) => count(PLAN_DEFINITIONS[tier].aiUsageCredits)),
			},
			{
				label: "Included model access",
				description:
					"Starter includes GPT-5.4 mini, Gemini 3 Flash, and Gemini 3.1 Flash Lite. Higher plans unlock the wider catalogue by model group.",
				values: {
					free: "K-AI",
					starter: "K-AI + 3 Basic models",
					plus: "K-AI + Basic + Pro",
					pro: "K-AI + Basic + Pro + Frontier",
					max: "All included groups",
				},
			},
		],
	},
	{
		title: "Context per request",
		rows: (["kai", "basic", "pro", "frontier"] as const).map((group) => ({
			label: `${group === "kai" ? "K-AI" : `${group.charAt(0).toUpperCase()}${group.slice(1)}`} context / output`,
			description:
				"Context includes instructions, conversation history, files, tools, and retrieved memory. Output is the maximum generated response.",
			values: values((tier) => contextValue(tier, group)),
		})),
	},
	{
		title: "Conversations and files",
		rows: [
			{
				label: "Conversation imports",
				description:
					"Imports from supported shared links or exports. Unlimited tiers have fair-use soft caps to prevent automated bulk abuse.",
				values: values((tier) => {
					const plan = PLAN_DEFINITIONS[tier];
					return plan.chatImports === null
						? `Unlimited fair use (${count(plan.importFairUseSoftLimit ?? 0)} soft cap)`
						: `${count(plan.chatImports)}/month`;
				}),
			},
			{
				label: "Data-import archive size",
				description:
					"Maximum size of a supported account or conversation archive. This is separate from files attached to a chat.",
				values: values((tier) => bytes(getImportUploadLimitBytes(tier))),
			},
			{
				label: "Chat file uploads",
				description: "Daily limits reset at 00:00 UTC.",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].chatUploadsPerDay;
					return limit === 0 ? "Not included" : `${limit}/day`;
				}),
			},
			{
				label: "Maximum chat file size",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].maxChatUploadBytes;
					return limit === 0 ? "Not included" : bytes(limit);
				}),
			},
			{
				label: "Stored files",
				description:
					"Storage for uploaded documents and media, separate from AI memory.",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].storedFilesBytes;
					return limit === 0 ? "Not included" : bytes(limit);
				}),
			},
			{
				label: "Export and import your data",
				values: values(() => true),
			},
		],
	},
	{
		title: "Search, memory, and creation",
		rows: [
			{
				label: "Web searches",
				description: "Provider-backed searches for current information.",
				values: values(
					(tier) => `${count(PLAN_DEFINITIONS[tier].webSearches)}/month`,
				),
			},
			{
				label: "Search availability",
				values: values((tier) =>
					PLAN_DEFINITIONS[tier].webSearchAllModels
						? "All available models"
						: "K-AI only",
				),
			},
			{
				label: "AI memory",
				description:
					"Searchable memories Kontinue can retrieve in future work.",
				values: values((tier) => bytes(PLAN_DEFINITIONS[tier].memoryBytes)),
			},
			{
				label: "K-Image generations",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].imageGenerations;
					return limit === 0 ? "Not included" : `${limit}/month`;
				}),
			},
			{
				label: "K-Video generation",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].videoGenerationSeconds;
					return limit === 0 ? "Not included" : `${limit} sec/month`;
				}),
			},
		],
	},
	{
		title: "Professional tools",
		rows: [
			{
				label: "Kontinue Live",
				description: "Realtime, interruptible voice sessions.",
				values: values((tier) => {
					const limit = PLAN_DEFINITIONS[tier].liveVoiceMinutes;
					return limit === 0 ? "Not included" : `${limit} min/month`;
				}),
			},
			{
				label: "Canvas",
				description:
					"The workspace is included on Pro and Max. AI generation inside it consumes usage credits.",
				values: values((tier) => PLAN_DEFINITIONS[tier].canvas),
			},
			{
				label: "Kode",
				description:
					"Access and build ceilings are included. Kode reserves AI units while it works, then returns unused units. One unit covers up to 25K model tokens and costs 25 shared AI usage credits.",
				values: values((tier) => {
					const plan = PLAN_DEFINITIONS[tier];
					if (plan.kodeMode === "none") return "Not included";
					return `${plan.kodeMode === "lite" ? "Kode Lite" : "Full Kode"} · ${plan.kodeBuilds} builds/month`;
				}),
			},
		],
	},
];

function Help({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={`About ${label}`}
					className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
				>
					<CircleHelp className="size-3.5" aria-hidden />
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-72 leading-relaxed" sideOffset={7}>
				{children}
			</TooltipContent>
		</Tooltip>
	);
}

function CellValue({ value }: { value: Value }) {
	if (typeof value === "boolean") {
		return value ? (
			<span className="mx-auto grid size-6 place-items-center rounded-full bg-primary/12 text-primary">
				<Check className="size-3.5" strokeWidth={2.5} aria-label="Included" />
			</span>
		) : (
			<span className="text-muted-foreground/45">
				<span aria-hidden>—</span>
				<span className="sr-only">Not included</span>
			</span>
		);
	}
	return value === "Not included" ? (
		<span className="text-muted-foreground/45">—</span>
	) : (
		<span>{value}</span>
	);
}

export function PricingComparison() {
	return (
		<div className="overflow-hidden rounded-3xl border border-border/70 bg-card/70 shadow-2xl shadow-black/5 backdrop-blur">
			<div className="overflow-x-auto overscroll-x-contain">
				<table className="w-full min-w-[1120px] border-separate border-spacing-0 text-sm">
					<caption className="sr-only">
						Compare Kontinue AI prices, quotas, context, files, and tools.
					</caption>
					<thead className="sticky top-0 z-30">
						<tr>
							<th className="sticky left-0 z-40 w-64 border-b border-border bg-card px-5 py-5 text-left text-base font-semibold">
								Features
							</th>
							{tiers.map((tier) => {
								const plan = PLAN_DEFINITIONS[tier];
								return (
									<th
										key={tier}
										className={`w-44 border-b border-border px-3 py-5 text-center ${tier === "plus" ? "bg-primary/[.07]" : "bg-card"}`}
									>
										<div className="flex items-center justify-center gap-2">
											<span className="font-semibold">{plan.name}</span>
											{tier === "plus" ? (
												<span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
													Popular
												</span>
											) : null}
										</div>
										<p className="mt-1 text-xs font-normal text-muted-foreground">
											{plan.priceMonthlyCents === 0
												? "$0 forever"
												: `$${(plan.priceMonthlyCents / 100).toFixed(2)}/month`}
										</p>
										{plan.priceMonthlyCents > 0 ? (
											<p className="mt-0.5 text-[10px] font-normal text-muted-foreground/80">
												{`$${(plan.priceAnnualMonthlyCents / 100).toFixed(2)}/month annually`}
											</p>
										) : null}
									</th>
								);
							})}
						</tr>
					</thead>
					<tbody>
						{sections.map((section) => (
							<Fragment key={section.title}>
								<tr>
									<th
										colSpan={tiers.length + 1}
										className="border-b border-border bg-muted/80 px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[.16em] text-foreground/70"
									>
										{section.title}
									</th>
								</tr>
								{section.rows.map((row) => (
									<tr key={row.label} className="group/row">
										<th className="sticky left-0 z-20 border-b border-border bg-card px-5 py-4 text-left font-medium group-hover/row:bg-muted/50">
											<span className="flex items-center gap-1.5">
												{row.label}
												{row.description ? (
													<Help label={row.label}>{row.description}</Help>
												) : null}
											</span>
										</th>
										{tiers.map((tier) => (
											<td
												key={tier}
												className={`border-b border-border px-3 py-4 text-center text-[13px] leading-snug group-hover/row:bg-muted/50 ${tier === "plus" ? "bg-primary/[.035]" : "bg-card"}`}
											>
												<CellValue value={row.values[tier]} />
											</td>
										))}
									</tr>
								))}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
