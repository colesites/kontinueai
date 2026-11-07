import Image from "next/image";
import { Reveal } from "@/components/anim/Reveal";
import { RotatingWord } from "./RotatingWord";

const stack = [
	{
		name: "ChatGPT",
		src: "/openai.svg",
		price: "$20",
		note: "Limit reached",
	},
	{
		name: "Claude",
		src: "/claude-ai-icon.svg",
		price: "$20",
		note: "Back in 5 hours",
	},
	{ name: "Gemini", src: "/gemini.svg", price: "$20", note: "Starts from zero" },
];

export function ProblemSection() {
	return (
		<section className="bg-background py-24 lg:py-32">
			<div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2 lg:gap-20 lg:px-8">
				<Reveal className="max-w-xl">
					<p className="eyebrow">The problem</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						The limit always hits in the middle of your{" "}
						<RotatingWord
							words={["essay", "bug fix", "pitch", "thesis"]}
							className="text-brand"
						/>
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						You are deep in a thread when the app tells you to come back later.
						Starting fresh somewhere else means pasting, explaining it all again
						and losing your flow.
					</p>

					<div className="mt-10 flex gap-10">
						<div>
							<div className="font-display text-4xl tracking-tight">5 hrs</div>
							<div className="mt-1 text-sm text-muted-foreground">
								How long a limit can hold you up
							</div>
						</div>
						<div className="border-l border-border pl-10">
							<div className="font-display text-4xl tracking-tight">0%</div>
							<div className="mt-1 text-sm text-muted-foreground">
								Of your context comes along to the next app
							</div>
						</div>
					</div>
				</Reveal>

				<Reveal x={0} y={32} delay={0.1}>
					<div className="rounded-[1.4rem] border border-border bg-card p-3 card-shadow sm:p-4">
						<div className="space-y-2">
							{stack.map((item) => (
								<div
									key={item.name}
									className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3.5"
								>
									<Image
										src={item.src}
										alt={item.name}
										width={22}
										height={22}
										className="size-5.5 shrink-0 object-contain opacity-80"
									/>
									<span className="text-sm font-medium">{item.name}</span>
									<span className="ml-auto rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
										{item.note}
									</span>
									<span className="w-14 text-right text-sm font-medium text-muted-foreground tabular-nums">
										{item.price}
										<span className="text-muted-foreground/60">/mo</span>
									</span>
								</div>
							))}
						</div>

						<div className="my-3 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
							becomes
						</div>

						<div className="flex items-center gap-3 rounded-xl border border-foreground/15 bg-foreground px-4 py-4 text-background">
							<span className="grid size-7 shrink-0 place-items-center rounded-md bg-background/15">
								<Image
									src="/kontinueai-icon.png"
									alt=""
									width={16}
									height={16}
									className="size-4 object-contain brightness-0 invert"
								/>
							</span>
							<span className="text-sm font-semibold">Kontinue AI</span>
							<span className="ml-auto rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-foreground">
								Keep going
							</span>
							<span className="w-20 text-right text-sm font-semibold tabular-nums">
								from $5.99<span className="opacity-70">/mo</span>
							</span>
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
