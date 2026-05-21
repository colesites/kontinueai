"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { type ChatTurn } from "../lib/chat-turns";
import { cn } from "@repo/ui/lib/utils";

type MobileChatTurnNavigatorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turns: ChatTurn[];
  activeTurnId: string | null;
  onJumpToTurn: (turnId: string) => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
};

export function MobileChatTurnNavigatorDialog({
  open,
  onOpenChange,
  turns,
  activeTurnId,
  onJumpToTurn,
  onScrollToTop,
  onScrollToBottom,
}: MobileChatTurnNavigatorDialogProps) {
  const handleJump = (turnId: string) => {
    onJumpToTurn(turnId);
    onOpenChange(false);
  };

  const handleScrollToTop = () => {
    onScrollToTop();
    onOpenChange(false);
  };

  const handleScrollToBottom = () => {
    onScrollToBottom();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[88dvh] w-[calc(100vw-0.75rem)] max-w-none gap-0 overflow-hidden rounded-2xl p-0 sm:w-[calc(100vw-2rem)] sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader className="border-b border-border/70 px-4 py-3 text-left">
          <DialogTitle className="text-base">Jump To Message</DialogTitle>
          <DialogDescription className="text-xs">
            Single tap quick-scrolls. Double tap opens this panel.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/70 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleScrollToTop}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-foreground"
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Top
            </button>
            <button
              type="button"
              onClick={handleScrollToBottom}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-foreground"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Bottom
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {turns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
              No user prompts yet.
            </p>
          ) : null}
          {turns.map((turn) => {
            const isActive = turn.id === activeTurnId;
            return (
              <button
                key={turn.id}
                type="button"
                onClick={() => handleJump(turn.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-all",
                  isActive
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/40 bg-muted/35 text-foreground hover:border-border hover:bg-muted/60",
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
      </DialogContent>
    </Dialog>
  );
}
