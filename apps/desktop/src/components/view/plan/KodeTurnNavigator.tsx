// Turn navigator for the Kode chat. Lives inside <Conversation> so it can
// stop the stick-to-bottom behavior before jumping to an older message.

import { useCallback } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { type ChatTurn, DesktopChatTurnNavigator } from "@/components/chat/DesktopChatTurnNavigator";
import { useAppSettings } from "@/lib/app-settings";

export function KodeTurnNavigator({ turns }: { turns: ChatTurn[] }) {
  const { scrollRef, stopScroll } = useStickToBottomContext();
  const { showTurnNavigator } = useAppSettings();
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  if (!showTurnNavigator) return null;
  return (
    <DesktopChatTurnNavigator
      turns={turns}
      getScrollElement={getScrollElement}
      onJumpToTurn={(turnId) => {
        const root = scrollRef.current;
        const message = document.getElementById(turnId);
        if (!root || !message) return;
        stopScroll();
        // scrollIntoView also scrolls overflow:hidden ancestors, which slides
        // the whole pane. Only the conversation itself should move.
        let node = message.parentElement;
        while (node && node !== document.body) {
          if (node !== root) {
            const overflow = getComputedStyle(node).overflowY;
            if (
              (overflow === "hidden" || overflow === "clip") &&
              node.scrollTop !== 0
            ) {
              node.scrollTop = 0;
            }
          }
          node = node.parentElement;
        }
        const top =
          root.scrollTop +
          (message.getBoundingClientRect().top -
            root.getBoundingClientRect().top) -
          72;
        const max = Math.max(0, root.scrollHeight - root.clientHeight);
        root.scrollTo({
          top: Math.min(Math.max(0, top), max),
          behavior: "smooth",
        });
      }}
    />
  );
}
