"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnimationConfig } from "@/lib/animations";

interface FeatureCardProps {
	icon: LucideIcon;
	title: string;
	description: string;
}

export function FeatureCard({
	icon: Icon,
	title,
	description,
}: FeatureCardProps) {
	return (
		<motion.div
			whileHover={getAnimationConfig({ scale: 1.03, y: -6 })}
			transition={{ duration: 0.3 }}
			className="h-full"
		>
			<Card variant="glass" className="h-full">
				<CardHeader className="pb-3">
					<div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/15">
						<Icon className="size-5 text-primary" />
					</div>
					<CardTitle className="font-display text-xl">{title}</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground leading-relaxed">
					{description}
				</CardContent>
			</Card>
		</motion.div>
	);
}
