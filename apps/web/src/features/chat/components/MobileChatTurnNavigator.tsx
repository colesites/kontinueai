"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { MobileChatTurnNavigatorDialog } from "./MobileChatTurnNavigatorDialog";
import { useDoubleTapActivation } from "../hooks/useDoubleTapActivation";
import { type ChatTurn } from "../lib/chat-turns";
import { cn } from "@repo/ui/lib/utils";

type MobileChatTurnNavigatorProps = {
  turns: ChatTurn[];
  activeTurnId: string | null;
  onJumpToTurn: (turnId: string) => void;
  showScrollToTopButton: boolean;
  showScrollToBottomButton: boolean;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
};

export function MobileChatTurnNavigator({
  turns,
  activeTurnId,
  onJumpToTurn,
  showScrollToTopButton,
  showScrollToBottomButton,
  onScrollToTop,
  onScrollToBottom,
}: MobileChatTurnNavigatorProps) {
  const [open, setOpen] = useState(false);
  const [showTapHint, setShowTapHint] = useState(false);
  const tapHintTimerRef = useRef<number | null>(null);
  const { isArmed, registerTap } = useDoubleTapActivation();

  // The visibility of this control on mobile should act like desktop:
  // It only shows when showScrollToTopButton or showScrollToBottomButton is true
  // (which means the user is actively scrolling and far from the edge).
  const isVisible = showScrollToTopButton || showScrollToBottomButton;

  const quickAction = showScrollToBottomButton
    ? "bottom"
    : showScrollToTopButton
      ? "top"
      : "bottom";

  const quickIcon =
    quickAction === "bottom" ? (
      <ArrowDown className="h-3.5 w-3.5" />
    ) : (
      <ArrowUp className="h-3.5 w-3.5" />
    );

  useEffect(() => {
    return () => {
      if (tapHintTimerRef.current) {
        window.clearTimeout(tapHintTimerRef.current);
      }
    };
  }, []);

  const showHint = () => {
    setShowTapHint(true);
    if (tapHintTimerRef.current) {
      window.clearTimeout(tapHintTimerRef.current);
    }
    tapHintTimerRef.current = window.setTimeout(() => {
      setShowTapHint(false);
      tapHintTimerRef.current = null;
    }, 3200);
  };

  const handleTriggerTap = () => {
    showHint();
    registerTap({
      onSingleTap: () => {
        if (quickAction === "bottom") onScrollToBottom();
        if (quickAction === "top") onScrollToTop();
      },
      onDoubleTap: () => {
        setShowTapHint(false);
        setOpen(true);
      },
    });
  };

  return (
    <>
      <div
        className={cn(
          "fixed bottom-38 left-1/2 z-50 -translate-x-1/2 lg:hidden transition-all duration-300",
          isVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        {showTapHint ? (
          <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-sm">
            Tip: double-tap to open the scroll panel
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleTriggerTap}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/85 text-foreground shadow-lg backdrop-blur-sm transition-all",
            isArmed && "scale-105 border-primary/60 text-primary",
          )}
          aria-label={`Single tap quick scroll, double tap open navigator (${turns.length} turns)`}
        >
          {quickIcon}
        </button>
      </div>

      <MobileChatTurnNavigatorDialog
        open={open}
        onOpenChange={setOpen}
        turns={turns}
        activeTurnId={activeTurnId}
        onJumpToTurn={onJumpToTurn}
        onScrollToTop={onScrollToTop}
        onScrollToBottom={onScrollToBottom}
      />
    </>
  );
}
