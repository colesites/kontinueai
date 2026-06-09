import { useRef, useState } from "react";
import {
  Folder,
  Globe,
  Maximize2,
  MessageCirclePlus,
  Plus,
  SquarePlus,
  TerminalSquare,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActionPanelProps = {
  layout: "bottom" | "side";
  open: boolean;
  onClose: () => void;
};

// Float gap, identical to the left sidebar (variant="floating" uses p-2 = 8px).
const GAP = 8;

const actions = [
  { title: "Files", description: "Browse project files", icon: Folder },
  { title: "Side chat", description: "Start a side conversation", icon: MessageCirclePlus },
  { title: "Browser", description: "Open a website", icon: Globe },
  { title: "Review", description: "View code changes", icon: SquarePlus },
  { title: "Terminal", description: "Start an interactive shell", icon: TerminalSquare },
];

const LIMITS = {
  bottom: { default: 340, min: 220, max: 640 },
  side: { default: 380, min: 300, max: 680 },
} as const;

export function ActionPanel({ layout, open, onClose }: ActionPanelProps) {
  const isBottom = layout === "bottom";
  const limits = LIMITS[layout];
  const [size, setSize] = useState<number>(limits.default);
  const frame = useRef<number | null>(null);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = isBottom ? e.clientY : e.clientX;
    const startSize = size;

    const onMove = (ev: PointerEvent) => {
      // Dragging up (bottom) / left (side) grows the panel.
      const delta = isBottom ? startPos - ev.clientY : startPos - ev.clientX;
      const next = Math.min(limits.max, Math.max(limits.min, startSize + delta));
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setSize(next));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Animate the in-flow size between 0 (closed) and `size` (open) — same idea as
  // the left sidebar's width transition. The inner card keeps a fixed size so it
  // slides/clips rather than squishing during the animation.
  const outerSize = open ? size : 0;
  const cardSize = Math.max(0, size - GAP * 2);

  return (
    <aside
      className={cn(
        "shrink-0 overflow-hidden text-foreground transition-[width,height,padding] duration-300 ease-in-out",
        isBottom ? "w-full" : "h-full",
        open ? "p-2" : "p-0",
      )}
      style={isBottom ? { height: outerSize } : { width: outerSize }}
    >
      <div
        className="glass-strong relative overflow-hidden rounded-2xl"
        style={
          isBottom
            ? { height: cardSize, width: "100%" }
            : { width: cardSize, height: "100%" }
        }
      >
        {/* Resize handle (on the edge that faces the content) */}
        <div
          role="separator"
          aria-label="Resize panel"
          onPointerDown={startResize}
          className={cn(
            "absolute z-10 flex items-center justify-center",
            isBottom
              ? "inset-x-0 top-0 h-2.5 cursor-ns-resize"
              : "inset-y-0 left-0 w-2.5 cursor-ew-resize",
          )}
        >
          <span
            className={cn(
              "rounded-full bg-white/15",
              isBottom ? "h-1 w-9" : "h-9 w-1",
            )}
          />
        </div>

        <div className="flex h-12 items-center justify-between px-5 pt-1">
        <button
          type="button"
          aria-label="Add panel item"
          className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.05] hover:text-foreground/75"
        >
          <Plus size={20} />
        </button>

        <div className="flex items-center gap-2">
          {!isBottom ? (
            <button
              type="button"
              aria-label="Expand panel"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.05] hover:text-foreground/75"
            >
              <Maximize2 size={17} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.05] hover:text-foreground/75"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto grid gap-3 px-6 pb-8",
          isBottom ? "max-w-4xl grid-cols-3 pt-4" : "max-w-[280px] grid-cols-1 pt-6",
        )}
      >
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.title}
              type="button"
              className={cn(
                "surface-inset group flex flex-col items-center justify-center rounded-xl text-center transition-colors duration-150 hover:bg-white/[0.045]",
                isBottom ? "min-h-[120px] px-5 py-6" : "min-h-[96px] px-6 py-5",
              )}
            >
              <Icon
                size={isBottom ? 23 : 24}
                strokeWidth={1.9}
                className="mb-4 text-foreground/55 transition-colors group-hover:text-foreground/80"
              />
              <span className="text-[14px] font-semibold leading-none text-foreground/90">
                {action.title}
              </span>
              <span className="mt-2.5 text-[12.5px] leading-none text-foreground/45">
                {action.description}
              </span>
            </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
