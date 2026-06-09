"use client";

import { motion } from "motion/react";
import type { UseCase } from "@/data/useCases";
import { getAnimationConfig, slideUp } from "@/lib/animations";

interface UseCaseScreenProps {
	useCase: UseCase;
	index: number;
}

function UseCaseScreen({ useCase, index }: UseCaseScreenProps) {
	return (
		<motion.div
			initial={getAnimationConfig(slideUp.initial)}
			whileInView={getAnimationConfig(slideUp.animate)}
			viewport={{ once: true, margin: "-200px" }}
			transition={{
				duration: 1.2,
				ease: [0.22, 1, 0.36, 1], // Quintic ease for high-end feel
				delay: 0.1,
			}}
			className="min-h-screen flex flex-col justify-center items-center text-center px-4 md:px-8 relative"
		>
			<div className="max-w-6xl mx-auto w-full">
				{/* Background Number for Depth */}
				<motion.span
					initial={{ opacity: 0, scale: 0.8 }}
					whileInView={{ opacity: 0.03, scale: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 1.5, ease: "easeOut" }}
					className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[40rem] font-display font-black pointer-events-none select-none -z-10"
				>
					{index + 1}
				</motion.span>

				<motion.div
					initial={{ opacity: 0, y: 30 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.8, delay: 0.3 }}
				>
					<span className="text-violet-600 font-bold tracking-[0.6em] uppercase text-xs md:text-sm mb-8 block">
						Case {index + 1}
					</span>

					<h3 className="font-display text-5xl md:text-7xl lg:text-9xl tracking-tightest leading-[0.9] mb-12 text-gray-900 balance-text">
						{useCase.title}
					</h3>

					<p className="text-xl md:text-3xl text-gray-500 max-w-4xl mx-auto leading-tight font-medium">
						{useCase.description}
					</p>
				</motion.div>
			</div>

			{/* Subtle indicator of more content */}
			<motion.div
				animate={{ y: [0, 10, 0] }}
				transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
				className="absolute bottom-12 left-1/2 -translate-x-1/2 opacity-20"
			>
				<div className="w-px h-12 bg-linear-to-b from-transparent via-violet-600 to-transparent" />
			</motion.div>
		</motion.div>
	);
}

interface UseCasesSectionProps {
	useCases: UseCase[];
}

export function UseCasesSection({ useCases }: UseCasesSectionProps) {
	return (
		<section id="use-cases" className="bg-white">
			<div className="container mx-auto">
				<div className="space-y-0">
					{useCases.map((useCase, index) => (
						<UseCaseScreen key={useCase.id} useCase={useCase} index={index} />
					))}
				</div>
			</div>
		</section>
	);
}
