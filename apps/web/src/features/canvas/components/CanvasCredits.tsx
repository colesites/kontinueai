"use client";

interface CanvasCreditsProps {
  isPro: boolean;
  mode: "image" | "video";
  remaining: number;
  total: number;
}

export function CanvasCredits({
  isPro,
  mode,
  remaining,
  total,
}: CanvasCreditsProps) {
  if (!isPro || mode !== "video") return null;

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
