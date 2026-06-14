"use client";

import { Play } from "lucide-react";
import { useRef, useState } from "react";
import { Reveal } from "@/components/anim/Reveal";

const DEMO_SRC =
	"https://res.cloudinary.com/dqovfvo29/video/upload/q_auto/f_auto/v1781228895/Kontinue_AI_Import_2_kxhlq0.mp4";
const DEMO_POSTER =
	"https://res.cloudinary.com/dqovfvo29/video/upload/so_2,q_auto/v1781228895/Kontinue_AI_Import_2_kxhlq0.jpg";

export function DemoVideo() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [started, setStarted] = useState(false);

	const play = () => {
		setStarted(true);
		videoRef.current?.play();
	};

	return (
		<section id="demo" className="bg-background py-24 lg:py-32">
			<div className="mx-auto max-w-5xl px-5 lg:px-8">
				<Reveal className="mx-auto max-w-2xl text-center">
					<p className="eyebrow">See it in action</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						From a share link to a living conversation
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Import a chat, switch the model, and keep going without losing a
						thing.
					</p>
				</Reveal>

				<Reveal y={32} delay={0.1} className="mt-14 lg:mt-16">
					<div className="relative overflow-hidden rounded-[1.6rem] border border-border bg-secondary card-shadow">
						<video
							ref={videoRef}
							src={DEMO_SRC}
							poster={DEMO_POSTER}
							controls={started}
							preload="none"
							playsInline
							onPlay={() => setStarted(true)}
							className="aspect-video w-full object-cover"
						>
							<track kind="captions" />
						</video>

						{!started && (
							<button
								type="button"
								onClick={play}
								aria-label="Play the Kontinue AI demo"
								className="group absolute inset-0 grid place-items-center bg-foreground/10 transition-colors hover:bg-foreground/5"
							>
								<span className="flex size-16 items-center justify-center rounded-full bg-background/95 shadow-lg ring-1 ring-foreground/5 transition-transform duration-300 group-hover:scale-110 sm:size-20">
									<Play className="size-6 translate-x-0.5 fill-foreground text-foreground sm:size-7" />
								</span>
							</button>
						)}
					</div>
				</Reveal>
			</div>
		</section>
	);
}
