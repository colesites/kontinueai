import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface ChatTurn {
  /** DOM id of the element that starts this turn. */
  id: string;
  preview: string;
}

interface DesktopChatTurnNavigatorProps {
  turns: ChatTurn[];
  onJumpToTurn: (turnId: string) => void;
  /** Controlled active turn. When omitted it follows the scroll position. */
  activeTurnId?: string | null;
  /** Scroll container used to work out which turn is in view. */
  getScrollElement?: () => HTMLElement | null;
  className?: string;
}

// Collapsed: a slim pill of ticks, one per user message, pinned to the right
// edge of the chat. Hover: a menu of message previews opens to its left.
export function DesktopChatTurnNavigator({
  turns,
  onJumpToTurn,
  activeTurnId: controlledActive,
  getScrollElement,
  className,
}: DesktopChatTurnNavigatorProps) {
  const [trackedActive, setTrackedActive] = useState<string | null>(null);
  const activeTurnId = controlledActive ?? trackedActive;

  useEffect(() => {
    const root = getScrollElement?.();
    if (!root || turns.length < 2) return;

    const update = () => {
      const lastId = turns[turns.length - 1]?.id ?? null;
      // At the end of the thread the latest message is the one in play, even
      // when its bubble still sits below the top of the pane.
      const distanceFromBottom =
        root.scrollHeight - root.scrollTop - root.clientHeight;
      if (distanceFromBottom <= 48) {
        setTrackedActive(lastId);
        return;
      }
      // The turn whose message is at the top of the pane — the one the
      // reader is in. Later messages still lower on the screen stay inactive.
      const line = root.getBoundingClientRect().top + 96;
      let current: string | null = null;
      for (const turn of turns) {
        const el = document.getElementById(turn.id);
        if (el && el.getBoundingClientRect().top <= line) current = turn.id;
      }
      setTrackedActive(current ?? turns[0]?.id ?? null);
    };

    update();
    root.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => {
      root.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [getScrollElement, turns]);

  if (turns.length < 2) return null;

  return (
    <aside
      className={cn(
        "group/nav pointer-events-none absolute top-1/2 right-3 z-30 -translate-y-1/2",
        className,
      )}
    >
      {/* Hover menu, opens to the left of the rail */}
      <div className="pointer-events-none absolute top-1/2 right-full -translate-y-1/2 pr-2 opacity-0 transition-opacity duration-150 group-hover/nav:pointer-events-auto group-hover/nav:opacity-100 group-focus-within/nav:pointer-events-auto group-focus-within/nav:opacity-100">
        <div className="liquid-glass-dropdown w-72 p-1.5">
          <p className="px-3 pt-1 pb-1.5 text-caption font-medium text-muted-foreground/70">
            Your messages
          </p>
          <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {turns.map((turn, index) => {
              const isActive = turn.id === activeTurnId;
              return (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => onJumpToTurn(turn.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-full px-3 py-1.5 text-left text-xs transition-colors",
                    isActive
                      ? "kontinue-menu-active"
                      : "text-muted-foreground kontinue-hover hover:text-foreground",
                  )}
                >
                  <span className="w-4 shrink-0 text-micro tabular-nums text-muted-foreground/60">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{turn.preview}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Collapsed rail */}
      <div className="liquid-glass-dropdown pointer-events-auto flex max-h-[40vh] w-7 flex-col items-center gap-1.5 overflow-hidden !rounded-full py-2.5">
        {turns.map((turn) => {
          const isActive = turn.id === activeTurnId;
          return (
            <button
              key={turn.id}
              type="button"
              onClick={() => onJumpToTurn(turn.id)}
              aria-label={`Go to: ${turn.preview}`}
              className="flex h-1.5 w-full shrink-0 cursor-pointer items-center justify-center"
            >
              <span
                className={cn(
                  "h-[3px] rounded-full transition-all duration-150",
                  isActive
                    ? "w-3.5 bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.7)] dark:bg-purple-400"
                    : "w-2.5 bg-foreground/25 hover:bg-foreground/50",
                )}
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
