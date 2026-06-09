"use client";

import { motion } from "motion/react";
import {
	easeTransition,
	fadeIn,
	getAnimationConfig,
	staggerContainer,
} from "@/lib/animations";
import { PricingCard } from "./PricingCard";

export interface PricingTier {
	id: string;
	name: string;
	price: string;
	period: string;
	features: string[];
	highlighted?: boolean;
}

interface PricingSectionProps {
	tiers: PricingTier[];
}

export function PricingSection({ tiers }: PricingSectionProps) {
	return (
		<section id="pricing" className="py-24 md:py-32 px-4 bg-gray-50/20">
			<div className="container mx-auto max-w-7xl">
				<motion.div
					className="text-center max-w-3xl mx-auto mb-20"
					initial={getAnimationConfig(fadeIn.initial)}
					whileInView={getAnimationConfig(fadeIn.animate)}
					viewport={{ once: true, margin: "-100px" }}
					transition={easeTransition}
				>
					<span className="text-[10px] uppercase tracking-[0.4em] font-black text-violet-500 bg-violet-50 px-4 py-2 rounded-full mb-8 inline-block">
						Pricing
					</span>
					<h2 className="mt-6 font-display text-5xl md:text-7xl tracking-tightest leading-[1.1]">
						One plan beats <br />
						<span className="bg-linear-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
							five subscriptions.
						</span>
					</h2>
				</motion.div>

				{/* Professional 3rd one under layout (3-column grid in a 7xl container) */}
				<motion.div
					className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10 max-w-7xl mx-auto items-stretch"
					variants={getAnimationConfig(staggerContainer)}
					initial="initial"
					whileInView="animate"
					viewport={{ once: true, margin: "-100px" }}
				>
					{tiers.map((tier, index) => (
						<motion.div
							key={tier.id}
							className="flex h-full w-full"
							variants={getAnimationConfig({
								initial: { opacity: 0, y: 30 },
								animate: { opacity: 1, y: 0 },
							})}
							transition={{ ...easeTransition, delay: index * 0.1 }}
						>
							<PricingCard
								name={tier.name}
								price={tier.price}
								period={tier.period}
								features={tier.features}
								highlighted={tier.highlighted}
							/>
						</motion.div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
