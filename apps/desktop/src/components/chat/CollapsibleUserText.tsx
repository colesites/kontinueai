import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Long user messages (pasted prompts, specs) collapse to a short preview with
// a fade, so one message can't turn into a wall of purple.
const COLLAPSED_HEIGHT = 168;

export function CollapsibleUserText({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > COLLAPSED_HEIGHT + 24);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const collapsed = overflows && !expanded;

  return (
    <div>
      <div
        ref={contentRef}
        style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
        className={cn(
          "overflow-hidden",
          collapsed &&
            "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
        )}
      >
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-label font-medium text-foreground/60 transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            size={12}
            className={cn("transition-transform", expanded && "rotate-180")}
          />
        </button>
      ) : null}
    </div>
  );
}
