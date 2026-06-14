import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/structured-data";

export function FinalCTA() {
	return (
		<section className="bg-background pb-24 lg:pb-32">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal y={32}>
					<div className="bg-noise relative overflow-hidden rounded-[2rem] bg-foreground px-6 py-16 text-center sm:px-12 sm:py-24">
						<div
							aria-hidden
							className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-[0.12] invert"
						/>
						<div className="relative">
							<p className="font-mono text-xs uppercase tracking-[0.22em] text-background/55">
								Stop starting over
							</p>
							<h2 className="font-display tracking-tightest mx-auto mt-5 max-w-2xl text-4xl leading-[1.05] text-background sm:text-6xl">
								Bring your chats. Switch models. Pay once.
							</h2>
							<p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-background/70">
								One workspace for every AI model. Get started free, no card
								required.
							</p>
							<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
								<Button
									asChild
									variant="brand"
									size="lg"
									className="w-full sm:w-auto"
								>
									<Link
										href={`${APP_URL}/sign-up`}
										target="_blank"
										rel="noopener noreferrer"
									>
										Start free
									</Link>
								</Button>
								<Button
									asChild
									size="lg"
									className="w-full border border-background/25 bg-transparent text-background hover:bg-background/10 sm:w-auto"
								>
									<Link
										href={`${APP_URL}/sign-in`}
										target="_blank"
										rel="noopener noreferrer"
									>
										Sign in
									</Link>
								</Button>
							</div>
						</div>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
