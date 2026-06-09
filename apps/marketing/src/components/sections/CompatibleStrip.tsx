"use client";

import { motion } from "motion/react";
import { easeTransition, fadeIn, getAnimationConfig } from "@/lib/animations";

const platforms = [
	"ChatGPT",
	"Claude",
	"Gemini",
	"Perplexity",
	"Mistral",
	"T3 Chat",
];

export function CompatibleStrip() {
	return (
		<section className="py-12 px-4 border-y bg-muted/30">
			<div className="container mx-auto">
				<motion.div
					className="text-center"
					initial={getAnimationConfig(fadeIn.initial)}
					whileInView={getAnimationConfig(fadeIn.animate)}
					viewport={{ once: true }}
					transition={easeTransition}
				>
					<p className="text-sm text-muted-foreground mb-6">
						Import your history from the tools you already use
					</p>
					<div className="flex flex-wrap justify-center items-center gap-8">
						{platforms.map((platform) => (
							<div
								key={platform}
								className="text-lg font-semibold text-muted-foreground/60"
							>
								{platform}
							</div>
						))}
					</div>
				</motion.div>
			</div>
		</section>
	);
}
