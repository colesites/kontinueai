// "Alpha" label shown while the desktop app is pre-1.0. Remove the uses (and
// this file) at 1.0.

import { cn } from "@/lib/utils";

export const ALPHA_NOTE = "Kontinue AI is in alpha: features may change and some things may break. Report problems from Help → Report a Problem.";

export function AlphaBadge({ className }: { className?: string }) {
  return (
    <span
      title={ALPHA_NOTE}
      className={cn(
        "inline-flex h-[18px] shrink-0 cursor-default items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 text-micro font-semibold tracking-wide text-purple-600 uppercase dark:text-purple-300",
        className,
      )}
    >
      Alpha
    </span>
  );
}
