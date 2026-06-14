"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { modelLogos } from "@/data/models";

export function HeroWorkspace() {
	const [active, setActive] = useState(0);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const timer = setInterval(() => {
			setActive((prev) => (prev + 1) % modelLogos.length);
		}, 2200);
		return () => clearInterval(timer);
	}, []);

	const model = modelLogos[active];

	return (
		<div className="overflow-hidden rounded-[1.4rem] border border-border bg-card card-shadow">
			{/* Top bar: thread title + live model switcher */}
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground">
						<Image
							src="/kontinueai-icon.png"
							alt=""
							width={14}
							height={14}
							className="size-3.5 object-contain brightness-0 invert"
						/>
					</span>
					<span className="truncate text-sm font-medium">
						Plan a 5-day Tokyo trip
					</span>
				</div>
				<div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-secondary py-1.5 pl-2.5 pr-2 text-xs font-medium">
					<span
						key={model.name}
						className="animate-swap inline-flex items-center gap-1.5"
					>
						<Image
							src={model.src}
							alt=""
							width={16}
							height={16}
							className="size-4 object-contain"
						/>
						<span className="tabular-nums">{model.name}</span>
					</span>
					<ChevronDown className="size-3.5 text-muted-foreground" />
				</div>
			</div>

			{/* Conversation */}
			<div className="space-y-3.5 p-4 sm:p-6">
				<div className="ml-auto max-w-[82%]">
					<div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
						Plan a 5-day Tokyo trip for early April.
					</div>
					<p className="mt-1.5 text-right text-[11px] font-medium text-muted-foreground">
						Imported from ChatGPT
					</p>
				</div>

				<div className="max-w-[86%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed text-foreground">
					Day 1 settles you in Shinjuku with the gardens in bloom, then eases
					into the city from there.
				</div>

				<div className="flex justify-center py-0.5">
					<span
						key={`switch-${model.name}`}
						className="animate-swap inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-[11px] font-medium text-brand-strong"
					>
						<span className="size-1.5 rounded-full bg-brand" />
						Context kept, now on {model.name}
					</span>
				</div>

				<div className="max-w-[86%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed text-foreground">
					Picking up where you left off, Day 4 adds a calmer day trip out to
					Hakone for the views.
				</div>
			</div>
		</div>
	);
}
