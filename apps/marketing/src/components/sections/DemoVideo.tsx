"use client";

import { Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { Reveal } from "@/components/anim/Reveal";

const DEMO_SRC =
	"https://res.cloudinary.com/dqovfvo29/video/upload/q_auto/f_auto/v1781228895/Kontinue_AI_Import_2_kxhlq0.mp4";
const DEMO_POSTER =
	"https://res.cloudinary.com/dqovfvo29/video/upload/so_2,q_auto/v1781228895/Kontinue_AI_Import_2_kxhlq0.jpg";

export function DemoVideo() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [isPlaying, setIsPlaying] = useState(true);

	const toggle = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			video.play();
		} else {
			video.pause();
		}
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
					<div className="relative overflow-hidden rounded-[1.6rem]">
						<video
							ref={videoRef}
							src={DEMO_SRC}
							poster={DEMO_POSTER}
							autoPlay
							muted
							loop
							playsInline
							onPlay={() => setIsPlaying(true)}
							onPause={() => setIsPlaying(false)}
							className="aspect-video w-full object-cover"
						>
							<track kind="captions" />
						</video>

						<button
							type="button"
							onClick={toggle}
							aria-label={isPlaying ? "Pause the demo" : "Play the demo"}
							className="absolute bottom-4 right-4 grid size-11 place-items-center rounded-full bg-background/70 text-foreground ring-1 ring-foreground/10 backdrop-blur-md transition hover:bg-background/90 sm:bottom-5 sm:right-5"
						>
							{isPlaying ? (
								<Pause className="size-4 fill-foreground" />
							) : (
								<Play className="size-4 translate-x-0.5 fill-foreground" />
							)}
						</button>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
