"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHAT_SCROLL_CONTAINER_ID,
  ChatTurn,
  getChatTurnAnchorId,
} from "../lib/chat-turns";

const ACTIVE_LINE_OFFSET = 96;

export function useChatTurnNavigation(turns: ChatTurn[]) {
  const [activeTurnId, setActiveTurnId] = useState<string | null>(
    turns[0]?.id ?? null,
  );

  const updateActiveTurn = useCallback(() => {
    if (turns.length === 0) {
      setActiveTurnId(null);
      return;
    }

    const container = document.getElementById(CHAT_SCROLL_CONTAINER_ID);
    if (!container) {
      setActiveTurnId(turns[0]?.id ?? null);
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + ACTIVE_LINE_OFFSET;
    let candidate = turns[0]?.id ?? null;

    for (const turn of turns) {
      const anchor = document.getElementById(getChatTurnAnchorId(turn.id));
      if (!anchor) continue;
      if (anchor.getBoundingClientRect().top <= threshold) {
        candidate = turn.id;
      } else {
        break;
      }
    }

    setActiveTurnId((previous) => (previous === candidate ? previous : candidate));
  }, [turns]);

  useEffect(() => {
    const container = document.getElementById(CHAT_SCROLL_CONTAINER_ID);
    if (!container) return;

    const handleScroll = () => updateActiveTurn();
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    const frame = window.requestAnimationFrame(handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [turns.length, updateActiveTurn]);

  const jumpToTurn = useCallback((turnId: string) => {
    const container = document.getElementById(CHAT_SCROLL_CONTAINER_ID);
    const target = document.getElementById(getChatTurnAnchorId(turnId));
    if (!container || !target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - 18;

    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "smooth",
    });

    setActiveTurnId(turnId);
  }, []);

  return {
    activeTurnId,
    jumpToTurn,
  };
}
