import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/anim/Reveal";
import type { UseCase } from "@/data/useCases";

interface UseCasesSectionProps {
	items: UseCase[];
}

export function UseCasesSection({ items }: UseCasesSectionProps) {
	return (
		<section id="use-cases" className="bg-background py-24 lg:py-32">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="max-w-2xl">
					<p className="eyebrow">When it helps</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						Built for the moments you actually hit
					</h2>
				</Reveal>

				<div className="mt-14 border-t border-border lg:mt-20">
					{items.map((useCase) => (
						<Reveal
							key={useCase.id}
							y={20}
							className="group grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2 border-b border-border py-10 transition-colors hover:bg-secondary/40 sm:gap-x-10 lg:grid-cols-[140px_1fr_auto] lg:py-14"
						>
							<span className="font-display text-4xl text-muted-foreground/25 transition-colors duration-300 group-hover:text-brand sm:text-6xl">
								{useCase.index}
							</span>
							<div className="col-span-2 lg:col-span-1">
								<h3 className="font-display text-2xl tracking-tight sm:text-3xl">
									{useCase.title}
								</h3>
								<p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
									{useCase.description}
								</p>
							</div>
							<ArrowUpRight className="col-start-2 row-start-1 size-6 translate-y-1 text-muted-foreground/40 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:text-foreground group-hover:opacity-100 lg:col-start-3 lg:self-center" />
						</Reveal>
					))}
				</div>
			</div>
		</section>
	);
}
