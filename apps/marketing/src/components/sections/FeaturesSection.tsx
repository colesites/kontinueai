"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { easeTransition, getAnimationConfig, slideUp } from "@/lib/animations";

interface FeatureProps {
	headline: string;
	description: string;
	image?: string;
	images?: string[];
	videos?: string[];
	isReversed?: boolean;
	isPricing?: boolean;
}

function FeatureSection({
	headline,
	description,
	image,
	images,
	videos,
	isReversed,
	isPricing = false,
}: FeatureProps) {
	return (
		<section className="py-24 md:py-32 border-t border-gray-100 first:border-none">
			<div className="container mx-auto px-4">
				<div
					className={`grid lg:grid-cols-2 gap-12 md:gap-20 items-center ${isReversed ? "lg:flex-row-reverse" : ""}`}
				>
					{/* Content */}
					<motion.div
						initial={getAnimationConfig(slideUp.initial)}
						whileInView={getAnimationConfig(slideUp.animate)}
						viewport={{ once: true, margin: "-100px" }}
						transition={easeTransition}
						className={`${isReversed ? "lg:order-2" : ""}`}
					>
						<h2 className="font-display text-3xl md:text-5xl leading-tight tracking-tight">
							{headline}
						</h2>
						<div className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed space-y-4">
							{description.split("\n").map((line) => (
								<p key={line.substring(0, 32)}>{line}</p>
							))}
						</div>
						{isPricing && (
							<div className="mt-8 flex flex-wrap gap-4">
								<div className="px-5 py-2 rounded-2xl bg-gray-50 border border-gray-200 shadow-sm">
									<span className="text-sm font-semibold text-gray-600">
										Free: $0
									</span>
								</div>
								<div className="px-5 py-2 rounded-2xl bg-violet-50 border border-violet-100/50 shadow-sm">
									<span className="text-sm font-semibold text-violet-700">
										Starter: $8.99
									</span>
								</div>
								<div className="px-5 py-2 rounded-2xl bg-violet-600 shadow-md shadow-violet-200">
									<span className="text-sm font-semibold text-white">
										Pro: $50
									</span>
								</div>
							</div>
						)}
					</motion.div>

					{/* Visuals */}
					<motion.div
						initial={getAnimationConfig({ opacity: 0, scale: 0.95, y: 20 })}
						whileInView={getAnimationConfig({ opacity: 1, scale: 1, y: 0 })}
						viewport={{ once: true, margin: "-100px" }}
						transition={{ ...easeTransition, delay: 0.2 }}
						className={`relative rounded-3xl overflow-hidden glass shadow-2xl ${isReversed ? "lg:order-1" : ""}`}
					>
						{image && (
							<div className="relative aspect-square md:aspect-video lg:aspect-square xl:aspect-video overflow-hidden group">
								<Image
									src={image}
									alt={headline}
									fill
									sizes="(max-width: 1024px) 100vw, 50vw"
									className="object-cover group-hover:scale-105 transition-transform duration-700"
								/>
							</div>
						)}

						{images && (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-gray-50/50">
								{images.map((img) => (
									<div
										key={img}
										className="relative aspect-square rounded-2xl overflow-hidden shadow-sm group"
									>
										<Image
											src={img}
											alt={`${headline} showcase`}
											fill
											sizes="(max-width: 640px) 100vw, 50vw"
											className="object-cover group-hover:scale-110 transition-transform duration-500"
										/>
									</div>
								))}
							</div>
						)}

						{videos && (
							<div className="relative aspect-video bg-black overflow-hidden group">
								<div className="grid grid-cols-2 h-full gap-1">
									{videos.map((vid) => (
										<video
											key={vid}
											src={vid}
											autoPlay
											muted
											loop
											playsInline
											preload="auto"
											className="w-full h-full object-cover"
										/>
									))}
								</div>
							</div>
						)}

						{/* Subtle overlay reflection */}
						<div className="absolute inset-0 pointer-events-none bg-linear-to-tr from-white/10 via-transparent to-white/5 opacity-50" />
					</motion.div>
				</div>
			</div>
		</section>
	);
}

export function FeaturesSection() {
	return (
		<div className="bg-white">
			<FeatureSection
				headline="Resume Any Conversation."
				description="Every prompt, document, and chat from your favourite models - all in one place. Stop searching across tabs and apps. Kontinue AI organises everything into a single, unified workspace that remembers your context perfectly."
				image="/import.jpg"
			/>

			<FeatureSection
				headline="Your Unified AI Stack."
				description="Switch between ChatGPT, Claude, Gemini, and more with a single click. Keep your context moving across the world's most powerful models without ever leaving your workflow. The right intelligence for every task, always ready."
				image="/anymodel.jpg"
				isReversed
			/>

			<FeatureSection
				headline="One Bill. Unlimited Power."
				description="Simplify your tech stack and your expenses. Access the highest tiers of every major AI model for one transparent price. No more multiple $20/month subscriptions cluttering your bank statement."
				image="/lessmoney.jpg"
				isPricing
			/>

			<FeatureSection
				headline="Voice without Borders."
				description="Send audio in any language and get perfect transcriptions that understand nuance and emotion. Whether you're dictating complex notes or recording a conversation, our engine captures every detail with precision."
				image="/audio.jpg"
				isReversed
			/>

			<FeatureSection
				headline="Create in an Instant."
				description="Turn your wildest visions into high-fidelity reality. From urban photography to character portraits, our image generation suite puts professional-grade studio capabilities in your hands instantly."
				images={["/woman-in-urban.png", "/cute-face.png"]}
			/>

			<FeatureSection
				headline="Next-Gen Video Generation."
				description="Bring your stories to life with cinematic precision. Generate stunning, coherent video content that pushes the boundaries of AI creativity. Professional motion at the speed of thought."
				videos={["/pricess-knight.mp4", "/model.mp4"]}
				isReversed
			/>

			<FeatureSection
				headline="AI + Emotional Intelligence."
				description="Technology that finally understands you. Our models go beyond raw processing to perceive tone, intent, and sentiment, providing responses that feel human, supportive, and truly collaborative."
				image="/ai+em.jpg"
			/>
		</div>
	);
}
