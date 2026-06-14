import Image from "next/image";
import { Reveal } from "@/components/anim/Reveal";
import { type FeatureBlock, featureBlocks } from "@/data/features";

function FeatureMedia({ block }: { block: FeatureBlock }) {
	return (
		<div className="relative overflow-hidden rounded-[1.4rem] border border-border bg-secondary card-shadow">
			{block.image && (
				<div className="relative aspect-[4/3]">
					<Image
						src={block.image}
						alt={block.title}
						fill
						sizes="(max-width: 1024px) 100vw, 50vw"
						className="object-cover"
					/>
				</div>
			)}

			{block.images && (
				<div className="grid grid-cols-2 gap-2 p-2">
					{block.images.map((src) => (
						<div
							key={src}
							className="relative aspect-[3/4] overflow-hidden rounded-xl"
						>
							<Image
								src={src}
								alt={block.title}
								fill
								sizes="(max-width: 1024px) 50vw, 25vw"
								className="object-cover"
							/>
						</div>
					))}
				</div>
			)}

			{block.videos && (
				<div className="grid grid-cols-2 gap-2 p-2">
					{block.videos.map((src) => (
						<video
							key={src}
							src={src}
							autoPlay
							muted
							loop
							playsInline
							preload="metadata"
							className="aspect-[3/4] w-full rounded-xl object-cover"
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function FeaturesSection() {
	return (
		<section id="features" className="bg-background py-24 lg:py-32">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="max-w-2xl">
					<p className="eyebrow">The workspace</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						More than a model switcher
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Voice, images and video live in the same place as your chats, so a
						whole project stays in one tab.
					</p>
				</Reveal>

				<div className="mt-20 space-y-24 lg:mt-28 lg:space-y-32">
					{featureBlocks.map((block, i) => {
						const reversed = i % 2 === 1;
						return (
							<div
								key={block.title}
								className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20"
							>
								<Reveal
									x={reversed ? 36 : -36}
									y={24}
									className={reversed ? "lg:order-2" : ""}
								>
									<p className="eyebrow text-brand">{block.eyebrow}</p>
									<h3 className="font-display mt-4 text-3xl tracking-tight sm:text-4xl">
										{block.title}
									</h3>
									<p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
										{block.description}
									</p>
								</Reveal>

								<Reveal
									y={32}
									delay={0.1}
									className={reversed ? "lg:order-1" : ""}
								>
									<FeatureMedia block={block} />
								</Reveal>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
