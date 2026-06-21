"use client";

interface CanvasCreditsProps {
	mode: "image" | "video";
	remaining: number;
	total: number;
}

export function CanvasCredits({ mode, remaining, total }: CanvasCreditsProps) {
	// Show for video whenever the user has any credit pool — Pro's monthly
	// allowance or a free/Starter user's referral-bonus credits (total > 0).
	if (mode !== "video" || total <= 0) return null;

	return (
		<div className="flex flex-col items-end leading-none">
			<span className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">
				Credits
			</span>
			<span className="text-[10px] font-black text-foreground/40 mt-0.5">
				{remaining} / {total}
			</span>
		</div>
	);
}
