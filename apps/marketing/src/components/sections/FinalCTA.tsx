import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/lib/structured-data";

export function FinalCTA() {
	return (
		<section className="bg-background py-20 lg:py-28">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal y={32}>
					<div className="glow-rail rounded-[2rem]">
						<div className="relative overflow-hidden rounded-[inherit] bg-foreground px-6 py-16 text-center sm:px-12 sm:py-24">
							<div
								aria-hidden
								className="bloom pointer-events-none absolute inset-x-[15%] -bottom-1/2 h-full opacity-80"
							/>
							<div
								aria-hidden
								className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-[0.12] invert"
							/>
							<div className="relative">
								<h2 className="font-display tracking-tightest mx-auto max-w-2xl text-4xl leading-[1.05] text-background sm:text-5xl">
									Your chat isn’t over. Keep going.
								</h2>
								<p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-background/70">
									Bring the conversation over and pick up right where you left
									off. Free to start.
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
											Continue a chat
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
					</div>
				</Reveal>
			</div>
		</section>
	);
}
