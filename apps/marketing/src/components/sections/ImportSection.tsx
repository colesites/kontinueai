import { ArrowRight, FileUp, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { appLinks } from "@/data/product";

const steps = [
	{
		icon: Share2,
		title: "Copy the shared link",
		description:
			"Open the conversation on ChatGPT, Claude, Gemini, or another supported platform, select Share, then copy the link.",
	},
	{
		icon: FileUp,
		title: "Import your conversation",
		description:
			"Paste the shared link into Kontinue AI. Kontinue prepares the supported messages and their sequence as a conversation.",
	},
	{
		icon: RefreshCw,
		title: "Continue with the right model",
		description:
			"Keep working with K-AI 1.0 or choose another supported model for the thread.",
	},
];

export function ImportSection() {
	return (
		<section
			id="import-conversations"
			className="border-y border-border bg-secondary/40 py-24 lg:py-32"
		>
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
					<Reveal className="max-w-2xl">
						<p className="eyebrow">Conversation portability</p>
						<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
							Your AI conversations should not be trapped in one app.
						</h2>
						<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
							Reached a message limit, found a better model, or want to move
							platforms? Import a supported conversation into Kontinue AI and
							continue from the available context instead of copying the thread
							by hand.
						</p>
						<div className="mt-9 flex flex-col gap-3 sm:flex-row">
							<TrackedLink
								href={appLinks.import}
								target="_blank"
								rel="noopener noreferrer"
								eventName="import_page_cta_clicked"
								eventProperties={{ location: "homepage_import_section" }}
							>
								Import a conversation
							</TrackedLink>
							<Link
								href="/import-ai-conversations"
								className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border-strong bg-card px-6 font-medium transition hover:bg-accent"
							>
								See supported methods
								<ArrowRight className="size-4" />
							</Link>
						</div>
					</Reveal>

					<Reveal stagger={0.1} className="space-y-3">
						{steps.map((step, index) => {
							const Icon = step.icon;
							return (
								<div
									key={step.title}
									data-anim
									className="flex gap-4 rounded-[1.2rem] border border-border bg-card p-5 sm:p-6"
								>
									<span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-strong">
										<Icon className="size-5" />
									</span>
									<div>
										<p className="font-mono text-[0.65rem] text-muted-foreground">
											0{index + 1}
										</p>
										<h3 className="font-display mt-1 text-xl tracking-tight">
											{step.title}
										</h3>
										<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
											{step.description}
										</p>
									</div>
								</div>
							);
						})}
					</Reveal>
				</div>
			</div>
		</section>
	);
}
