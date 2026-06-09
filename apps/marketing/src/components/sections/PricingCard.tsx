"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnimationConfig } from "@/lib/animations";

interface PricingCardProps {
	name: string;
	price: string;
	period: string;
	features: string[];
	highlighted?: boolean;
}

export function PricingCard({
	name,
	price,
	period,
	features,
	highlighted = false,
}: PricingCardProps) {
	return (
		<motion.div
			whileHover={getAnimationConfig({ scale: 1.02, y: -4 })}
			transition={{ duration: 0.3 }}
			className="h-full w-full"
		>
			<Card
				variant="glass"
				className={
					highlighted
						? "h-full border-violet-200 bg-white shadow-[0_32px_80px_-16px_rgba(139,92,246,0.15)] ring-1 ring-violet-500/10 z-10"
						: "h-full border-gray-100 bg-white/60 shadow-sm"
				}
			>
				<CardHeader className="p-8 md:p-10 pb-4">
					<div className="h-5 mb-3 flex items-center">
						{highlighted && (
							<div className="text-[10px] font-black text-violet-600 uppercase tracking-[0.4em]">
								Most popular
							</div>
						)}
					</div>
					<CardTitle className="font-display text-2xl md:text-3xl text-gray-900">
						{name}
					</CardTitle>
					<div className="mt-4 flex items-baseline gap-1">
						<span className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900">
							{price}
						</span>
						<span className="text-gray-500 font-medium text-sm">/{period}</span>
					</div>
				</CardHeader>
				<CardContent className="p-8 md:p-10 pt-0 space-y-8 flex flex-col justify-between h-full">
					<ul className="space-y-4 grow">
						{features.map((feature) => (
							<li
								key={feature}
								className="flex items-start gap-3 text-sm md:text-base text-gray-600 font-medium"
							>
								<Check className="size-4 text-violet-500 shrink-0 mt-0.5" />
								<span>{feature}</span>
							</li>
						))}
					</ul>
					<div className="mt-8">
						<Button
							asChild
							variant={highlighted ? "default" : "outline"}
							size="lg"
							className={`w-full h-12 md:h-14 rounded-xl text-base font-bold transition-all duration-300 ${
								!highlighted
									? "border-gray-200 hover:bg-gray-50 text-gray-700"
									: "bg-violet-600 hover:bg-violet-700 text-white shadow-xl shadow-violet-100"
							}`}
						>
							<Link
								href="https://chat.kontinueai.com/sign-up"
								target="_blank"
								rel="noopener noreferrer"
							>
								Get started
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}
