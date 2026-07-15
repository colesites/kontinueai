import { Reveal } from "@/components/anim/Reveal";

const DEMO_SRC =
	"https://res.cloudinary.com/djsskkp4r/video/upload/q_auto/f_auto/v1784125732/Kontinue_AI_Demo_lqp7s6.mp4";
const DEMO_POSTER =
	"https://res.cloudinary.com/djsskkp4r/video/upload/so_2,q_auto/v1784125732/Kontinue_AI_Demo_lqp7s6.jpg";

export function DemoVideo() {
	return (
		<section id="demo" className="bg-background py-24 lg:py-32">
			<div className="mx-auto max-w-7xl px-5 lg:px-8">
				<Reveal className="mx-auto max-w-2xl text-center">
					<p className="eyebrow">See it in action</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						From a share link to a living conversation
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						Import a supported shared conversation, choose the next model, and
						continue with the available message context.
					</p>
				</Reveal>

				<Reveal y={32} delay={0.1} className="mt-14 lg:mt-16">
					<div className="aspect-[1920/1200] overflow-hidden border-2 border-foreground bg-foreground">
						<video
							aria-label="Kontinue AI conversation import demo"
							autoPlay
							className="block size-full object-cover"
							disablePictureInPicture
							disableRemotePlayback
							loop
							muted
							playsInline
							poster={DEMO_POSTER}
							preload="auto"
							src={DEMO_SRC}
							width={1920}
							height={1200}
						>
							<track kind="captions" />
						</video>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
