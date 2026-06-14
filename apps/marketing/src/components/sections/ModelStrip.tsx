import Image from "next/image";
import { modelLogos } from "@/data/models";

export function ModelStrip() {
	// Duplicated for a seamless marquee loop; precompute stable keys.
	const row = [...modelLogos, ...modelLogos].map((model, i) => ({
		...model,
		uid: `${model.name}-${i}`,
	}));

	return (
		<section
			aria-label="Supported AI model providers"
			className="border-y border-border bg-background py-10"
		>
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<p className="eyebrow mb-8 text-center">
					Bring your conversations from the models you already use
				</p>
				<div className="marquee mask-fade-x overflow-hidden">
					<div className="marquee-track flex w-max items-center gap-12 pr-12">
						{row.map((model) => (
							<div
								key={model.uid}
								className="flex items-center gap-2.5 opacity-60 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
							>
								<Image
									src={model.src}
									alt={model.name}
									width={26}
									height={26}
									className="size-6 object-contain"
								/>
								<span className="text-sm font-medium text-muted-foreground">
									{model.name}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
