import { cn } from "@/lib/utils";

export interface ChatTurn {
  id: string;
  preview: string;
}

interface DesktopChatTurnNavigatorProps {
  turns: ChatTurn[];
  activeTurnId: string | null;
  onJumpToTurn: (turnId: string) => void;
}

export function DesktopChatTurnNavigator({
  turns,
  activeTurnId,
  onJumpToTurn,
}: DesktopChatTurnNavigatorProps) {
  if (turns.length < 2) return null;

  return (
    <aside className="pointer-events-none fixed right-4 top-1/2 z-30 -translate-y-1/2">
      <div
        className={cn(
          "group pointer-events-auto w-8 overflow-hidden rounded-2xl border border-white/[0.1] bg-card/85 p-1.5 backdrop-blur-xl transition-all duration-200 shadow-xl",
          "hover:w-[290px] hover:p-3 hover:shadow-2xl focus-within:w-[290px] focus-within:p-3 focus-within:shadow-2xl"
        )}
      >
        {/* Expanded User Turns List (On Hover/Focus) */}
        <div className="hidden space-y-2 group-hover:block group-focus-within:block">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
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
                    "group/item flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs transition-all",
                    isActive
                      ? "border-brand/40 bg-brand/10 text-white font-medium"
                      : "border-white/[0.06] bg-white/[0.03] text-muted-foreground hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{turn.preview}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "h-0.5 w-3 shrink-0 rounded-full transition-all",
                      isActive ? "bg-brand" : "bg-white/30 group-hover/item:bg-white/60"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsed Vertical Indicator Bar (Default state) */}
        <div className="flex flex-col items-center gap-1.5 py-1 group-hover:hidden group-focus-within:hidden">
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
                    ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                    : "bg-white/30 hover:bg-white/60"
                )}
                aria-label={`Go to: ${turn.preview}`}
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}
