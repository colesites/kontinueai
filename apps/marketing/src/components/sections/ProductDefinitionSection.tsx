import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";

const pillars = [
	{
		title: "Continue any chat",
		description:
			"Bring a conversation over from ChatGPT, Claude or Gemini and finish what you started, with the history in place.",
		href: "/import-ai-conversations",
	},
	{
		title: "Never wait on a reset",
		description:
			"When one model runs out, switch to another in the same thread. Your conversation stays exactly where it is.",
		href: "/supported-models",
	},
	{
		title: "K-AI 1.0 included",
		description:
			"Our own model comes with every plan, free included, so there is always something to keep going with.",
		href: "/kontinue-model",
	},
];

export function ProductDefinitionSection() {
	return (
		<section className="border-b border-border bg-background py-24 lg:py-32">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="max-w-3xl">
					<p className="eyebrow">What is Kontinue AI?</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						Where your chats go when the limit hits
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Kontinue AI picks up conversations from ChatGPT, Claude and Gemini
						so you can finish what you started. Once you are here, K-AI 1.0 and
						leading models live in one place, so one app’s limit never stops
						your work again.
					</p>
				</Reveal>

				<Reveal
					stagger={0.1}
					className="mt-14 grid gap-5 md:grid-cols-3 lg:mt-20"
				>
					{pillars.map((pillar, index) => (
						<Link
							key={pillar.title}
							href={pillar.href}
							data-anim
							className="group flex min-h-72 flex-col rounded-[1.4rem] border border-border bg-card p-7 transition hover:-translate-y-1 hover:border-brand/30 card-shadow sm:p-8"
						>
							<span className="font-mono text-xs text-brand">
								{String(index + 1).padStart(2, "0")}
							</span>
							<h3 className="font-display mt-12 text-2xl tracking-tight">
								{pillar.title}
							</h3>
							<p className="mt-4 leading-relaxed text-muted-foreground">
								{pillar.description}
							</p>
							<span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-medium text-brand-strong">
								Explore
								<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
							</span>
						</Link>
					))}
				</Reveal>
			</div>
		</section>
	);
}
