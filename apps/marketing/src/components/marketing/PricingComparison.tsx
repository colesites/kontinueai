"use client";

import { Check, ChevronDown, CircleHelp, Search } from "lucide-react";
import {
	Select as SelectPrimitive,
	Tooltip as TooltipPrimitive,
} from "radix-ui";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import {
	type PricingComparisonRow,
	type PricingComparisonSection,
	type PricingComparisonValue,
	pricingComparisonSections,
} from "@/data/pricing-comparison";
import { formatUsd, type ProductPlanId, plans } from "@/data/product";

const defaultPlanId: ProductPlanId = plans[0].id;

function FeatureTooltip({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger asChild>
				<button
					type="button"
					aria-label={`About ${label}`}
					className="inline-grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition hover:bg-brand-tint hover:text-brand-strong focus-visible:bg-brand-tint focus-visible:text-brand-strong"
				>
					<CircleHelp aria-hidden className="size-3.5" />
				</button>
			</TooltipPrimitive.Trigger>
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Content
					sideOffset={8}
					collisionPadding={16}
					className="z-50 max-w-[19rem] rounded-xl bg-foreground px-3.5 py-3 text-xs leading-relaxed text-background shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0"
				>
					{children}
					<TooltipPrimitive.Arrow className="fill-foreground" />
				</TooltipPrimitive.Content>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);
}

function ComparisonValue({ value }: { value: PricingComparisonValue }) {
	if (typeof value === "boolean") {
		return value ? (
			<span className="inline-grid size-6 place-items-center rounded-full bg-brand-tint align-middle text-brand-strong">
				<Check aria-label="Included" className="size-3.5" strokeWidth={2.5} />
			</span>
		) : (
			<span className="text-border-strong">
				<span aria-hidden>—</span>
				<span className="sr-only">Not included</span>
			</span>
		);
	}

	const unavailable = value === "Not included";
	return (
		<span
			className={
				unavailable ? "text-muted-foreground/55" : "text-foreground/85"
			}
		>
			{unavailable ? "—" : value}
		</span>
	);
}

function ComparisonTable() {
	return (
		<div className="overflow-hidden rounded-[1.35rem] border border-border bg-card card-shadow">
			<div className="overflow-x-auto overscroll-x-contain">
				<table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
					<caption className="sr-only">
						Compare Kontinue AI plan prices, model access, limits and tools.
					</caption>
					<thead className="sticky top-0 z-30">
						<tr className="bg-card">
							<th className="sticky left-0 z-40 w-[260px] border-b border-border bg-card px-5 py-5 text-left font-display text-base">
								Features
							</th>
							{plans.map((plan) => (
								<th
									key={plan.id}
									className={`w-[184px] border-b border-border px-4 py-5 text-center ${
										plan.highlighted ? "bg-brand-tint/55" : "bg-card"
									}`}
								>
									<div className="flex min-h-5 items-center justify-center gap-2">
										<span className="font-display text-base">{plan.name}</span>
										{plan.highlighted ? (
											<span className="rounded-full bg-brand px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.13em] text-brand-foreground">
												Popular
											</span>
										) : null}
									</div>
									<p className="mt-1 text-xs font-normal text-muted-foreground">
										{formatUsd(plan.monthlyPriceUsd)}
										{plan.monthlyPriceUsd > 0 ? "/month" : " forever"}
									</p>
									{plan.monthlyPriceUsd > 0 ? (
										<p className="mt-0.5 text-[10px] font-normal text-muted-foreground/80">
											{formatUsd(plan.annualMonthlyPriceUsd)}/month annually
										</p>
									) : null}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{pricingComparisonSections.map((section) => (
							<Fragment key={section.title}>
								<tr>
									<th
										colSpan={plans.length + 1}
										className="border-b border-border bg-secondary/75 px-5 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/75"
									>
										{section.title}
									</th>
								</tr>
								{section.rows.map((row) => (
									<tr key={row.label} className="group/row">
										<th className="sticky left-0 z-20 border-b border-border bg-card px-5 py-4 text-left font-medium group-hover/row:bg-secondary/35">
											<span className="flex items-center gap-1.5">
												{row.label}
												{row.description ? (
													<FeatureTooltip label={row.label}>
														{row.description}
													</FeatureTooltip>
												) : null}
											</span>
										</th>
										{plans.map((plan) => (
											<td
												key={plan.id}
												className={`border-b border-border px-4 py-4 text-center text-[13px] leading-snug group-hover/row:bg-secondary/35 ${
													plan.highlighted ? "bg-brand-tint/25" : "bg-card"
												}`}
											>
												<ComparisonValue value={row.values[plan.id]} />
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

function MobileRow({
	row,
	planId,
}: {
	row: PricingComparisonRow;
	planId: ProductPlanId;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-border px-4 py-3.5 last:border-b-0">
			<p className="text-sm font-medium leading-snug">{row.label}</p>
			<div className="max-w-[8.5rem] text-right text-[13px] leading-snug">
				<ComparisonValue value={row.values[planId]} />
			</div>
			{row.description ? (
				<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
					{row.description}
				</p>
			) : null}
		</div>
	);
}

function MobileComparison() {
	const [planId, setPlanId] = useState<ProductPlanId>(defaultPlanId);
	const [query, setQuery] = useState("");

	const selectedPlan = plans.find((plan) => plan.id === planId) ?? plans[0];

	const sections = useMemo<PricingComparisonSection[]>(() => {
		const term = query.trim().toLowerCase();
		if (!term) return pricingComparisonSections;
		return pricingComparisonSections
			.map((section) => ({
				title: section.title,
				rows: section.rows.filter(
					(row) =>
						row.label.toLowerCase().includes(term) ||
						section.title.toLowerCase().includes(term) ||
						row.description?.toLowerCase().includes(term),
				),
			}))
			.filter((section) => section.rows.length > 0);
	}, [query]);

	return (
		<div className="lg:hidden">
			<div className="sticky top-16 z-30 -mx-5 space-y-2.5 border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
				<div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 transition-colors focus-within:border-border-strong">
					<Search
						aria-hidden
						className="size-4 shrink-0 text-muted-foreground"
					/>
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search feature…"
						aria-label="Search features"
						className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>

				<SelectPrimitive.Root
					value={planId}
					onValueChange={(value) => setPlanId(value as ProductPlanId)}
				>
					<SelectPrimitive.Trigger
						aria-label="Choose a plan to compare"
						className="flex w-full items-center justify-between gap-3 rounded-full border border-border bg-card px-4 py-2.5 text-left text-sm outline-none transition-colors focus-visible:border-border-strong data-[state=open]:border-border-strong"
					>
						<span className="flex min-w-0 items-baseline gap-2">
							<SelectPrimitive.Value />
							<span className="truncate text-xs text-muted-foreground">
								{formatUsd(selectedPlan.monthlyPriceUsd)}
								{selectedPlan.monthlyPriceUsd > 0 ? "/month" : " forever"}
							</span>
						</span>
						<SelectPrimitive.Icon asChild>
							<ChevronDown
								aria-hidden
								className="size-4 shrink-0 text-muted-foreground"
							/>
						</SelectPrimitive.Icon>
					</SelectPrimitive.Trigger>
					<SelectPrimitive.Portal>
						<SelectPrimitive.Content
							position="popper"
							sideOffset={6}
							collisionPadding={16}
							className="card-shadow z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-border bg-card"
						>
							<SelectPrimitive.Viewport className="p-1.5">
								{plans.map((plan) => (
									<SelectPrimitive.Item
										key={plan.id}
										value={plan.id}
										className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[state=checked]:bg-brand-tint data-[state=checked]:text-brand-strong"
									>
										<SelectPrimitive.ItemText>
											{plan.name}
										</SelectPrimitive.ItemText>
										<span className="text-xs text-muted-foreground">
											{formatUsd(plan.monthlyPriceUsd)}
											{plan.monthlyPriceUsd > 0 ? "/month" : " forever"}
										</span>
									</SelectPrimitive.Item>
								))}
							</SelectPrimitive.Viewport>
						</SelectPrimitive.Content>
					</SelectPrimitive.Portal>
				</SelectPrimitive.Root>
			</div>

			<div className="mt-6 space-y-5">
				{sections.length === 0 ? (
					<p className="rounded-[1.35rem] border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
						No features match “{query.trim()}”.
					</p>
				) : (
					sections.map((section) => (
						<section
							key={section.title}
							className="overflow-hidden rounded-[1.35rem] border border-border bg-card card-shadow"
						>
							<h3 className="border-b border-border bg-secondary/75 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/75">
								{section.title}
							</h3>
							{section.rows.map((row) => (
								<MobileRow key={row.label} row={row} planId={planId} />
							))}
						</section>
					))
				)}
			</div>
		</div>
	);
}

export function PricingComparison() {
	return (
		<TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={300}>
			<MobileComparison />
			<div className="hidden lg:block">
				<ComparisonTable />
			</div>
			<p className="mt-4 text-xs leading-relaxed text-muted-foreground">
				Request counts are monthly safety ceilings. AI usage credits are shared
				across metered AI work, so higher-cost model groups, media, Live and
				Kode use the balance faster. Limits reset monthly at 00:00 UTC.
			</p>
		</TooltipPrimitive.Provider>
	);
}
