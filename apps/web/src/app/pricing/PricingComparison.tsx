"use client";

import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { PLAN_TIERS } from "@repo/core/plan-tier";
// Shared with the Expo pricing screen.
import {
	PRICING_COMPARISON_SECTIONS,
	type PricingComparisonValue,
} from "@repo/core/pricing-comparison";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { Check, CircleHelp } from "lucide-react";
import { Fragment, type ReactNode } from "react";

type Value = PricingComparisonValue;

const tiers = [...PLAN_TIERS];
const sections = PRICING_COMPARISON_SECTIONS;

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
