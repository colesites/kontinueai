"use client";

import { motion } from "motion/react";
import Image from "next/image";

export const modelIcons = [
	{ name: "OpenAI", src: "/openai.svg", size: 56 },
	{ name: "Claude", src: "/claude-ai-icon.svg", size: 52 },
	{ name: "Gemini", src: "/gemini.svg", size: 52 },
	{ name: "Grok", src: "/grok-light.svg", size: 52 },
	{ name: "Meta", src: "/meta.svg", size: 52 },
	{ name: "Mistral", src: "/mistral-ai_logo.svg", size: 48 },
	{ name: "Perplexity", src: "/perplexity.svg", size: 52 },
	{ name: "Qwen", src: "/qwen_light.svg", size: 52 },
];

/* Positions for 8 satellite icons around the center.
   Recalculated for 8 icons in a larger circle. */
const positions = [
	{ x: -240, y: -120 }, // top-left
	{ x: -200, y: 100 }, // bottom-left
	{ x: -60, y: -200 }, // top-center-left
	{ x: 180, y: -160 }, // top-right
	{ x: 260, y: 40 }, // middle-right
	{ x: 140, y: 160 }, // bottom-right
	{ x: 60, y: -220 }, // top-center-right
	{ x: -120, y: 200 }, // bottom-center-left
];

/* Responsive positions (scaled down for mobile) */
const mobilePositions = [
	{ x: -110, y: -80 },
	{ x: -100, y: 70 },
	{ x: -30, y: -110 },
	{ x: 100, y: -90 },
	{ x: 120, y: 30 },
	{ x: 70, y: 100 },
	{ x: 40, y: -120 },
	{ x: -50, y: 120 },
];

function ConnectLine({
	x1,
	y1,
	x2,
	y2,
	delay,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	delay: number;
}) {
	return (
		<motion.line
			x1={x1}
			y1={y1}
			x2={x2}
			y2={y2}
			stroke="#e5e7eb"
			strokeWidth="1.5"
			strokeDasharray="4 4"
			initial={{ pathLength: 0, opacity: 0 }}
			animate={{ pathLength: 1, opacity: 1 }}
			transition={{ duration: 0.8, delay, ease: "easeOut" }}
		/>
	);
}

export function IntegrationConnect() {
	const centerX = 300;
	const centerY = 230;

	return (
		<div className="relative w-full flex items-center justify-center">
			{/* Desktop version */}
			<div
				className="hidden md:block relative"
				style={{ width: 600, height: 460 }}
			>
				{/* SVG lines connecting center to satellites */}
				<svg
					className="absolute inset-0 w-full h-full"
					viewBox="0 0 600 460"
					fill="none"
					role="img"
					aria-label="Connection lines between Kontinue AI and AI model icons"
					style={{ zIndex: 0 }}
				>
					{positions.map((pos, i) => (
						<ConnectLine
							key={modelIcons[i].name}
							x1={centerX}
							y1={centerY}
							x2={centerX + pos.x}
							y2={centerY + pos.y}
							delay={0.3 + i * 0.1}
						/>
					))}
					{/* Small dots at endpoints */}
					{positions.map((pos, i) => (
						<motion.circle
							key={`dot-${modelIcons[i].name}`}
							cx={centerX + pos.x}
							cy={centerY + pos.y}
							r="3"
							fill="#e5e7eb"
							initial={{ opacity: 0, scale: 0 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ delay: 0.6 + i * 0.1 }}
						/>
					))}
				</svg>

				{/* Center Kontinue AI icon */}
				<motion.div
					className="absolute z-10 flex items-center justify-center"
					style={{
						left: centerX - 56,
						top: centerY - 56,
						width: 112,
						height: 112,
					}}
					initial={{ opacity: 0, scale: 0.5 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<div className="w-28 h-28 rounded-xl bg-white border border-gray-100 flex items-center justify-center icon-card-shadow-3d">
						<Image
							src="/kontinueai-icon.png"
							alt="Kontinue AI"
							width={56}
							height={56}
							className="w-14 h-14 object-contain"
							priority
						/>
					</div>
				</motion.div>

				{/* Satellite model icons */}
				{modelIcons.map((model, i) => (
					<motion.div
						key={model.name}
						className="absolute z-10 flex items-center justify-center"
						style={{
							left: centerX + positions[i].x - 32,
							top: centerY + positions[i].y - 32,
							width: 64,
							height: 64,
						}}
						initial={{ opacity: 0, scale: 0, y: 10 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={{
							duration: 0.4,
							delay: 0.4 + i * 0.08,
							ease: "easeOut",
						}}
					>
						<div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center icon-card-shadow-3d">
							<Image
								src={model.src}
								alt={`${model.name} logo`}
								width={32}
								height={32}
								className="w-8 h-8 object-contain"
							/>
						</div>
					</motion.div>
				))}
			</div>

			{/* Mobile version */}
			<div
				className="block md:hidden relative"
				style={{ width: 300, height: 260 }}
			>
				<svg
					className="absolute inset-0 w-full h-full"
					viewBox="0 0 300 260"
					fill="none"
					role="img"
					aria-label="Connection lines between Kontinue AI and AI model icons"
					style={{ zIndex: 0 }}
				>
					{mobilePositions.map((pos, i) => (
						<ConnectLine
							key={`m-${modelIcons[i].name}`}
							x1={150}
							y1={130}
							x2={150 + pos.x}
							y2={130 + pos.y}
							delay={0.3 + i * 0.1}
						/>
					))}
					{mobilePositions.map((pos, i) => (
						<motion.circle
							key={`m-dot-${modelIcons[i].name}`}
							cx={150 + pos.x}
							cy={130 + pos.y}
							r="2.5"
							fill="#e5e7eb"
							initial={{ opacity: 0, scale: 0 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ delay: 0.6 + i * 0.1 }}
						/>
					))}
				</svg>

				{/* Center icon mobile */}
				<motion.div
					className="absolute z-10 flex items-center justify-center"
					style={{
						left: 150 - 36,
						top: 130 - 36,
						width: 72,
						height: 72,
					}}
					initial={{ opacity: 0, scale: 0.5 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.5, ease: "easeOut" }}
				>
					<div className="w-18 h-18 rounded-lg bg-white border border-gray-100 flex items-center justify-center icon-card-shadow-3d">
						<Image
							src="/kontinueai-icon.png"
							alt="Kontinue AI"
							width={40}
							height={40}
							className="w-10 h-10 object-contain"
							priority
						/>
					</div>
				</motion.div>

				{/* Satellite icons mobile */}
				{modelIcons.map((model, i) => (
					<motion.div
						key={`m-${model.name}`}
						className="absolute z-10 flex items-center justify-center"
						style={{
							left: 150 + mobilePositions[i].x - 22,
							top: 130 + mobilePositions[i].y - 22,
							width: 44,
							height: 44,
						}}
						initial={{ opacity: 0, scale: 0, y: 10 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={{
							duration: 0.4,
							delay: 0.4 + i * 0.08,
							ease: "easeOut",
						}}
					>
						<div className="w-11 h-11 rounded-lg bg-white flex items-center justify-center icon-card-shadow-3d">
							<Image
								src={model.src}
								alt={`${model.name} logo`}
								width={22}
								height={22}
								className="w-5.5 h-5.5 object-contain"
							/>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}
