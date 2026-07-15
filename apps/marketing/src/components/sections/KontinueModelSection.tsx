import { BrainCircuit, Layers3, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { appLinks } from "@/data/product";

export function KontinueModelSection() {
	return (
		<section className="bg-background py-24 lg:py-32">
			<div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-8">
				<Reveal className="max-w-2xl">
					<p className="eyebrow text-brand">The Kontinue AI model</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						Our own intelligence, built into the platform.
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						K-AI 1.0 is Kontinue AI’s proprietary intelligence and orchestration
						layer. It combines supported underlying models with Kontinue
						capabilities such as memory, retrieval, projects, tasks, connectors,
						and specialised agents—without pretending to be a foundation model
						trained from scratch.
					</p>
					<div className="mt-9 flex flex-col gap-3 sm:flex-row">
						<Link
							href="/kontinue-model"
							className="inline-flex h-11 items-center justify-center rounded-full border border-border-strong bg-card px-6 font-medium transition hover:bg-accent"
						>
							Learn about K-AI 1.0
						</Link>
						<TrackedLink
							href={appLinks.signUp}
							target="_blank"
							rel="noopener noreferrer"
							eventName="kontinue_model_cta_clicked"
						>
							Try Kontinue AI
						</TrackedLink>
					</div>
				</Reveal>

				<Reveal y={32} delay={0.1}>
					<div className="rounded-[1.6rem] border border-border bg-card p-4 card-shadow sm:p-5">
						<div className="rounded-[1.2rem] bg-foreground p-7 text-background sm:p-9">
							<div className="flex items-center justify-between gap-4">
								<span className="grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
									<BrainCircuit className="size-6" />
								</span>
								<span className="rounded-full border border-background/15 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest text-background/60">
									Native option
								</span>
							</div>
							<p className="font-display mt-12 text-4xl tracking-tight">
								K-AI 1.0
							</p>
							<p className="mt-3 text-sm leading-relaxed text-background/65">
								Kontinue intelligence, product context, and model choice in one
								experience.
							</p>
							<div className="mt-9 grid grid-cols-2 gap-3">
								<div className="rounded-xl border border-background/10 bg-background/5 p-4">
									<Layers3 className="size-4 text-brand-foreground" />
									<p className="mt-4 text-sm font-medium">
										Kontinue capabilities
									</p>
								</div>
								<div className="rounded-xl border border-background/10 bg-background/5 p-4">
									<RefreshCw className="size-4 text-brand-foreground" />
									<p className="mt-4 text-sm font-medium">Model freedom</p>
								</div>
							</div>
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
