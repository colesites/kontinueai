import { ArrowDown, ArrowUp } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type ScrollJumpControlsProps = {
  showTop: boolean;
  showLatest: boolean;
  onTop: () => void;
  onLatest: () => void;
  className?: string;
  style?: CSSProperties;
};

// Floating "back to top" + "Jump to latest" controls shared by the Home and
// Kode chats. Sits centered above the composer.
export function ScrollJumpControls({ showTop, showLatest, onTop, onLatest, className, style }: ScrollJumpControlsProps) {
  if (!showTop && !showLatest) return null;

  return (
    <div className={cn("pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5", className)} style={style}>
      {showTop ? (
        <button type="button" onClick={onTop} title="Back to top" aria-label="Back to top" className="kontinue-3d kontinue-jump pointer-events-auto flex size-8 cursor-pointer items-center justify-center rounded-full text-foreground/75 animate-in fade-in zoom-in-95 duration-150 hover:text-foreground">
          <ArrowUp size={13} />
        </button>
      ) : null}
      {showLatest ? (
        <button type="button" onClick={onLatest} className="kontinue-3d kontinue-jump pointer-events-auto flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-medium text-foreground/85 animate-in fade-in zoom-in-95 duration-150 hover:text-foreground">
          <ArrowDown size={13} className="text-purple-500 dark:text-purple-300" />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
