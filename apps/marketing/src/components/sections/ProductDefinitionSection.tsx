import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";

const pillars = [
	{
		title: "K-AI 1.0",
		description:
			"Use Kontinue AI’s native intelligence layer for supported everyday work, writing, research assistance, reasoning, and coding.",
		href: "/kontinue-model",
	},
	{
		title: "Import and continue",
		description:
			"Bring a supported conversation into Kontinue AI and continue from the available message context instead of rebuilding it manually.",
		href: "/import-ai-conversations",
	},
	{
		title: "Access leading models",
		description:
			"Choose from selected models across leading providers without scattering your work across disconnected applications.",
		href: "/supported-models",
	},
];

export function ProductDefinitionSection() {
	return (
		<section className="border-b border-border bg-background py-24 lg:py-32">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="max-w-3xl">
					<p className="eyebrow">What is Kontinue AI?</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						More than a multi-model workspace
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Kontinue AI is a multi-model AI platform with K-AI 1.0, access to
						other leading models, and technology for moving supported AI
						conversations into one place. Ask, create, research, reason, and
						code while keeping your conversations portable.
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
