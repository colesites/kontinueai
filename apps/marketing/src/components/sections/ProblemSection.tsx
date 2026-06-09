"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { motion } from "motion/react";
import { easeTransition, fadeIn, getAnimationConfig } from "@/lib/animations";

const problemPoints = [
	"Subscription Fatigue",
	"Fragmented Context",
	"Rate Limit Walls",
];

const solutionPoints = ["Unified Chat History", "Instant Model Switching"];

export function ProblemSection() {
	return (
		<section className="py-24 px-4 bg-white overflow-hidden">
			<div className="container mx-auto max-w-6xl">
				{/* Header */}
				<motion.div
					className="text-center max-w-3xl mx-auto mb-16"
					initial={getAnimationConfig(fadeIn.initial)}
					whileInView={getAnimationConfig(fadeIn.animate)}
					viewport={{ once: true }}
					transition={easeTransition}
				>
					<h2 className="font-display text-4xl md:text-5xl leading-tight tracking-tight">
						Stop paying for the same answers,{" "}
						<span className="text-violet-600">multiple times.</span>
					</h2>
					<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
						One month it&apos;s ChatGPT, the next it&apos;s Claude, then Gemini.
						The result? Scattered chats, separate limits, and a{" "}
						<span className="font-semibold text-foreground">
							$60+ stack of subscriptions.
						</span>
					</p>
				</motion.div>

				{/* Comparison Grid */}
				<div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 md:gap-12 items-center">
					{/* Left: The Stress (Problem) */}
					<motion.div
						initial={getAnimationConfig({ opacity: 0, x: -30 })}
						whileInView={getAnimationConfig({ opacity: 1, x: 0 })}
						viewport={{ once: true }}
						transition={easeTransition}
						className="relative p-8 md:p-10 rounded-[2.5rem] bg-gray-50/50 border border-gray-100 overflow-hidden group"
					>
						{/* "Noisy" Background elements */}
						<div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-red-500/5 blur-3xl rounded-full" />
						<div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full" />

						<h3 className="font-display text-xl mb-8 text-gray-500 uppercase tracking-widest text-center">
							The Stress
						</h3>

						<div className="space-y-6 relative z-10">
							{problemPoints.map((point, i) => (
								<motion.div
									key={point}
									initial={{ opacity: 0, y: 10 }}
									whileInView={{ opacity: 1, y: 0 }}
									transition={{ delay: i * 0.1 }}
									className="flex items-center gap-4 p-4 rounded-2xl bg-white/40 border border-white/60 shadow-sm"
								>
									<div className="shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center border border-red-100">
										<X className="w-4 h-4 text-red-500" />
									</div>
									<span className="text-gray-600 font-medium">{point}</span>
								</motion.div>
							))}
						</div>

						{/* Visual Clutter/Noise */}
						<div className="mt-8 pt-6 border-t border-gray-100 border-dashed opacity-40">
							<div className="flex gap-2 flex-wrap">
								{[
									"$20/mo",
									"$22.50",
									"Limit reached",
									"Upgrade to Pro",
									"Context Lost",
								].map((tag) => (
									<span
										key={tag}
										className="px-2 py-1 text-[10px] uppercase tracking-tighter bg-gray-200 text-gray-600 rounded-md"
									>
										{tag}
									</span>
								))}
							</div>
						</div>
					</motion.div>

					{/* Center Divider/Arrow */}
					<div className="flex justify-center lg:rotate-0 rotate-90 py-4 lg:py-0">
						<div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center border border-violet-200 shadow-inner">
							<ArrowRight className="w-6 h-6 text-violet-600" />
						</div>
					</div>

					{/* Right: The Kontinue Way (Solution) */}
					<motion.div
						initial={getAnimationConfig({ opacity: 0, x: 30 })}
						whileInView={getAnimationConfig({ opacity: 1, x: 0 })}
						viewport={{ once: true }}
						transition={{ ...easeTransition, delay: 0.2 }}
						className="relative p-8 md:p-10 rounded-[2.5rem] bg-linear-to-b from-white to-violet-50/30 border border-violet-200 shadow-[0_20px_50px_-20px_rgba(139,92,246,0.15)] overflow-hidden"
					>
						{/* Premium Glow */}
						<div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 blur-[100px] rounded-full" />

						<h3 className="font-display text-2xl mb-8 text-violet-700 font-bold text-center">
							The Kontinue Way
						</h3>

						<div className="space-y-6 relative z-10 mb-10">
							{solutionPoints.map((point, i) => (
								<motion.div
									key={point}
									initial={{ opacity: 0, y: 10 }}
									whileInView={{ opacity: 1, y: 0 }}
									transition={{ delay: (i + 3) * 0.1 }}
									className="flex items-center gap-4 p-5 rounded-3xl bg-white border border-violet-100 shadow-md group hover:border-violet-300 transition-all duration-300"
								>
									<div className="shrink-0 w-10 h-10 rounded-full bg-green-50 flex items-center justify-center border border-green-100 shadow-sm group-hover:scale-110 transition-transform">
										<Check className="w-5 h-5 text-green-500" />
									</div>
									<span className="text-gray-900 font-semibold tracking-tight">
										{point}
									</span>
								</motion.div>
							))}
						</div>

						{/* Price Pills */}
						<div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
							<div className="w-full sm:w-auto px-5 py-2 rounded-xl bg-white/40 backdrop-blur-md border border-white/60 shadow-sm flex flex-col items-center group hover:bg-white transition-colors cursor-default">
								<span className="text-[9px] uppercase tracking-widest text-gray-400 mb-0.5 font-bold">
									Free
								</span>
								<span className="font-bold text-sm leading-none font-display">
									$0
								</span>
							</div>
							<div className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white/60 backdrop-blur-md border border-white/80 shadow-sm flex flex-col items-center group hover:bg-white transition-colors cursor-default">
								<span className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 font-bold">
									Starter
								</span>
								<span className="font-bold text-lg leading-none font-display">
									$8.99
								</span>
							</div>
							<div className="w-full sm:w-auto px-8 py-4 rounded-3xl bg-violet-600/10 backdrop-blur-md border border-violet-200 shadow-lg flex flex-col items-center group relative overflow-hidden transition-all hover:scale-105 cursor-default">
								{/* Shiny effect */}
								<div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
								<span className="text-[11px] uppercase tracking-widest text-violet-700 font-bold mb-1">
									Pro
								</span>
								<span className="font-extrabold text-2xl leading-none font-display text-violet-800">
									$50
								</span>
							</div>
						</div>

						<p className="mt-8 text-center text-sm text-violet-600/60 font-medium italic">
							Premium clarity, simplified.
						</p>
					</motion.div>
				</div>
			</div>
		</section>
	);
}
