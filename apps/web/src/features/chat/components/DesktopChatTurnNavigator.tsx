"use client";

import { type ChatTurn } from "../lib/chat-turns";
import { cn } from "@repo/ui/lib/utils";

type DesktopChatTurnNavigatorProps = {
  turns: ChatTurn[];
  activeTurnId: string | null;
  isExpanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  onJumpToTurn: (turnId: string) => void;
};

export function DesktopChatTurnNavigator({
  turns,
  activeTurnId,
  isExpanded,
  onExpandChange,
  onJumpToTurn,
}: DesktopChatTurnNavigatorProps) {
  return (
    <aside className="pointer-events-none fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
      <div
        className={cn(
          "pointer-events-auto overflow-hidden rounded-2xl border border-border/70 bg-background/75 backdrop-blur-md transition-all duration-200",
          isExpanded ? "w-[290px] p-3 shadow-2xl" : "w-8 p-1.5 shadow-lg",
        )}
        onMouseEnter={() => onExpandChange(true)}
        onMouseLeave={() => onExpandChange(false)}
      >
        {isExpanded ? (
          <div className="space-y-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              User Turns
            </p>
            <div className="max-h-[48vh] space-y-1.5 overflow-y-auto pr-1">
              {turns.map((turn) => {
                const isActive = turn.id === activeTurnId;
                return (
                  <button
                    key={turn.id}
                    type="button"
                    onClick={() => onJumpToTurn(turn.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-all",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/40 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/55 hover:text-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{turn.preview}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "h-0.5 w-3 shrink-0 rounded-full transition-all",
                        isActive
                          ? "bg-primary"
                          : "bg-muted-foreground/45 group-hover:bg-foreground/60",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            {turns.map((turn) => {
              const isActive = turn.id === activeTurnId;
              return (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => onJumpToTurn(turn.id)}
                  className={cn(
                    "h-1.5 w-3 rounded-full transition-all",
                    isActive
                      ? "bg-primary shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                      : "bg-muted-foreground/35 hover:bg-foreground/55",
                  )}
                  aria-label={`Go to: ${turn.preview}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
