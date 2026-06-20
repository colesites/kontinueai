"use client";

import { cn } from "@repo/ui/lib/utils";
import { Image as ImageIcon, Video } from "lucide-react";

interface CanvasModeToggleProps {
	mode: "image" | "video";
	setMode: (mode: "image" | "video") => void;
}

const MODES = [
	{ value: "image", label: "Image", Icon: ImageIcon },
	{ value: "video", label: "Video", Icon: Video },
] as const;

/**
 * Segmented image/video selector. The active mode renders as a glowing,
 * primary-filled pill (the "video button" look from the design ref); the
 * inactive mode is a quiet glass icon. Theme-aware via the primary token.
 */
export function CanvasModeToggle({ mode, setMode }: CanvasModeToggleProps) {
	return (
		<div className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-border/40 bg-secondary/15 p-1">
			{MODES.map(({ value, label, Icon }) => {
				const active = mode === value;
				return (
					<button
						key={value}
						type="button"
						onClick={() => setMode(value)}
						aria-pressed={active}
						title={`${label} generation`}
						className={cn(
							"inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold uppercase tracking-tight transition-all duration-300",
							active
								? "glow-button text-primary-foreground scale-[1.03]"
								: "text-foreground/55 hover:bg-foreground/8 hover:text-foreground",
						)}
					>
						<Icon className="h-3.5 w-3.5" />
						{label}
					</button>
				);
			})}
		</div>
	);
}
