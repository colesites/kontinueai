"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { easeTransition, fadeIn, getAnimationConfig } from "@/lib/animations";

export function FinalCTA() {
	return (
		<section className="py-24 px-4">
			<div className="container mx-auto max-w-4xl">
				<motion.div
					className="glass glow-border rounded-xl p-10 md:p-14 text-center"
					initial={getAnimationConfig(fadeIn.initial)}
					whileInView={getAnimationConfig(fadeIn.animate)}
					viewport={{ once: true }}
					transition={easeTransition}
				>
					<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
						Ready to consolidate
					</p>
					<h2 className="mt-4 font-display text-3xl md:text-5xl">
						Stop juggling AI subscriptions.
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						Bring your chats. Switch models. Pay once.
					</p>
					<div className="mt-8 flex flex-wrap justify-center gap-4">
						<Button asChild size="lg" className="button-glow">
							<Link
								href="https://chat.kontinueai.com/sign-up"
								target="_blank"
								rel="noopener noreferrer"
							>
								Sign up
							</Link>
						</Button>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
