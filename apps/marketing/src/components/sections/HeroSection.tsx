"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	easeTransition,
	getAnimationConfig,
	staggerContainer,
	staggerItem,
} from "@/lib/animations";

import { IntegrationConnect } from "./IntegrationConnect";

export function HeroSection() {
	return (
		<section className="relative overflow-hidden bg-white pt-28 pb-24 md:pt-32 md:pb-32 lg:min-h-screen lg:flex lg:items-center">
			{/* Hero glow effect */}
			<div className="hero-glow" />

			<div className="container mx-auto px-4 relative z-10">
				<motion.div
					variants={getAnimationConfig(staggerContainer)}
					initial="initial"
					animate="animate"
					className="flex flex-col items-center text-center"
				>
					{/* Integration Connect Component */}
					<motion.div
						variants={getAnimationConfig(staggerItem)}
						transition={easeTransition}
						className="w-full mb-8 md:mb-12"
					>
						<IntegrationConnect />
					</motion.div>

					{/* Title */}
					<motion.h1
						className="font-display text-4xl md:text-5xl lg:text-6xl leading-tight text-gray-900 max-w-3xl"
						variants={getAnimationConfig(staggerItem)}
						transition={easeTransition}
					>
						Never start from scratch
						<br />
						<span className="bg-linear-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">
							again
						</span>
					</motion.h1>

					{/* Subtitle */}
					<motion.p
						className="mt-5 text-lg md:text-xl text-gray-500 max-w-2xl leading-relaxed font-medium"
						variants={getAnimationConfig(staggerItem)}
						transition={easeTransition}
					>
						Hit a limit? Import your chat and keep going. Kontinue AI brings
						your conversations, context, and favourite models into one seamless
						workspace.
					</motion.p>

					{/* CTA Button */}
					<motion.div
						className="mt-8"
						variants={getAnimationConfig(staggerItem)}
						transition={easeTransition}
					>
						<Button asChild size="lg" className="rounded-lg shadow-xl">
							<Link
								href="https://chat.kontinueai.com/sign-up"
								target="_blank"
								rel="noopener noreferrer"
							>
								Sign up
							</Link>
						</Button>
					</motion.div>
				</motion.div>
			</div>
		</section>
	);
}
