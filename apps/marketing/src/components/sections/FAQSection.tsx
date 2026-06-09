"use client";

import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	easeTransition,
	fadeIn,
	getAnimationConfig,
	staggerContainer,
} from "@/lib/animations";

const faqs = [
	{
		question: "Can I really import chats from different AI apps?",
		answer:
			"Yes, Kontinue AI lets you bring your existing conversations into one workspace.",
	},
	{
		question: "Do I need separate subscriptions for each model?",
		answer:
			"No. Kontinue AI is built so you can use different models in one place.",
	},
	{
		question: "How does it help with hallucinations?",
		answer:
			"Switch models in one click to verify answers. If one model misbehaves, you can continue the same chat with another provider to cross-check.",
	},
	{
		question: "What does the pricing look like?",
		answer:
			"We offer three simple tiers: Free ($0) for getting started, Starter ($8.99) for more imports and power, and Pro ($50) for the ultimate AI workspace.",
	},
];

export function FAQSection() {
	return (
		<section id="faq" className="py-24 px-4">
			<div className="container mx-auto max-w-4xl">
				<motion.div
					className="text-center mb-14"
					initial={getAnimationConfig(fadeIn.initial)}
					whileInView={getAnimationConfig(fadeIn.animate)}
					viewport={{ once: true }}
					transition={easeTransition}
				>
					<p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
						FAQ
					</p>
					<h2 className="mt-4 font-display text-4xl md:text-5xl">
						Answers without the fluff
					</h2>
				</motion.div>

				<motion.div
					className="space-y-6"
					variants={getAnimationConfig(staggerContainer)}
					initial="initial"
					whileInView="animate"
					viewport={{ once: true }}
				>
					{faqs.map((faq, index) => (
						<motion.div
							key={faq.question}
							variants={getAnimationConfig({
								initial: { opacity: 0, y: 20 },
								animate: { opacity: 1, y: 0 },
							})}
							transition={{ ...easeTransition, delay: index * 0.08 }}
						>
							<Card variant="glass">
								<CardHeader>
									<CardTitle className="text-lg font-display">
										{faq.question}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">{faq.answer}</p>
								</CardContent>
							</Card>
						</motion.div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
