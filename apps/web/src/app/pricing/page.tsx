"use client";

import { AI_USAGE_CREDIT_COSTS } from "@repo/core/ai-usage-credits";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { PlanCards } from "./PlanCards";
import { PricingComparison } from "./PricingComparison";

export default function PricingPage() {
	const router = useRouter();

	return (
		<div className="relative min-h-screen bg-background text-foreground selection:bg-primary/30">
			{/* Ambient brand glow — clipped to its own layer so it can't cause
			    horizontal scroll. Layering is by DOM order (glow first = behind),
			    NOT z-index: an explicit z-index here builds a stacking context that
			    paints over Clerk's checkout drawer overlay and hides it. */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<div className="absolute left-1/2 top-0 h-[420px] w-[820px] max-w-[130vw] -translate-x-1/2 rounded-[100%] bg-primary/15 blur-[120px]" />
			</div>

			<div className="relative mx-auto flex w-full max-w-[90rem] flex-col px-4 py-10 sm:px-6 sm:py-16">
				{/* Header */}
				<div className="mb-10 text-center">
					<button
						type="button"
						onClick={() => router.back()}
						className="surface-inset group mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground"
					>
						<ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
						Go back
					</button>
					<p className="eyebrow">Pricing</p>
					<h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
						Pick the right plan for your workflow
					</h1>
					<p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
						Start cheaply, see every real limit, and move up only when your work
						needs more models, context, or professional tools.
					</p>
				</div>

				<main className="relative space-y-20">
					<div className="mx-auto w-full max-w-[88rem]">
						<PlanCards />
					</div>

					<section
						aria-labelledby="credits-heading"
						className="mx-auto max-w-6xl"
					>
						<p className="eyebrow text-center">One shared balance</p>
						<h2
							id="credits-heading"
							className="mt-3 text-center text-3xl font-semibold tracking-tight sm:text-4xl"
						>
							What AI usage credits cover
						</h2>
						<div className="mt-8 grid gap-4 md:grid-cols-3">
							{[
								[
									"Chat, search, and media",
									"Paid model work, provider-backed web search, K-Image, and K-Video draw from the same monthly balance.",
								],
								[
									"Canvas and Kode",
									"Opening either workspace costs nothing. AI generation in Canvas and AI runs in Kode consume credits.",
								],
								[
									"Live and safeguards",
									"Live voice uses credits while connected. Product-specific ceilings still protect you from unexpected overuse.",
								],
							].map(([title, copy]) => (
								<div
									key={title}
									className="rounded-2xl border border-border/70 bg-card/65 p-5"
								>
									<h3 className="font-semibold">{title}</h3>
									<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
										{copy}
									</p>
								</div>
							))}
						</div>
						<div className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-border/70 bg-card/65 sm:grid-cols-4">
							{[
								[
									"Basic request",
									`${AI_USAGE_CREDIT_COSTS.chatRequest.basic} credit`,
								],
								[
									"Pro request",
									`${AI_USAGE_CREDIT_COSTS.chatRequest.pro} credits`,
								],
								[
									"Frontier request",
									`${AI_USAGE_CREDIT_COSTS.chatRequest.frontier} credits`,
								],
								["Web search", `${AI_USAGE_CREDIT_COSTS.webSearch} credits`],
								["K-Image", `${AI_USAGE_CREDIT_COSTS.imageGeneration} credits`],
								[
									"K-Video",
									`from ${AI_USAGE_CREDIT_COSTS.videoGenerationPerSecond}/second`,
								],
								[
									"Kontinue Live",
									`${AI_USAGE_CREDIT_COSTS.liveVoicePerSecond}/second`,
								],
								[
									"Kode AI unit (up to 25K tokens)",
									`${AI_USAGE_CREDIT_COSTS.kodeCredit} credits`,
								],
							].map(([label, value]) => (
								<div
									key={label}
									className="border-b border-r border-border/70 p-4"
								>
									<p className="text-xs text-muted-foreground">{label}</p>
									<p className="mt-1 text-sm font-semibold tabular-nums">
										{value}
									</p>
								</div>
							))}
						</div>
						<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
							Rates are per operation. Product-specific request, duration, and
							build ceilings also apply, so credits do not replace the limits
							below.
						</p>
					</section>

					<section aria-labelledby="comparison-heading">
						<div className="mb-8">
							<p className="eyebrow">Full comparison</p>
							<h2
								id="comparison-heading"
								className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
							>
								Every limit, written plainly
							</h2>
							<p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
								Numbers show real included values. Checkmarks are reserved for
								simple yes-or-no features. Hover or focus a question mark for
								details.
							</p>
						</div>
						<PricingComparison />
						<p className="mt-4 text-xs leading-relaxed text-muted-foreground">
							Request ceilings and AI usage credits both apply. Limits reset
							monthly at 00:00 UTC; daily upload limits reset each day.
						</p>
					</section>
				</main>
			</div>
		</div>
	);
}
