// App-wide keyboard shortcuts that aren't tied to one view (Settings →
// Keyboard shortcuts): back/forward between chats, next/previous/jump to a
// thread, pin, open usage, cycle the theme. Mounted once in ViewLayout.

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { useKeybinding } from "@/lib/kode-keybindings";
import { useKodeWorkspace, type KodeChat, type KodeTab } from "@/lib/kode-workspace";

type Place = { tab: KodeTab; chatId: string };
const MAX_HISTORY = 50;

/** Sidebar order: pinned first (newest pin first), then most recently updated. */
function sidebarOrder(chats: KodeChat[]): KodeChat[] {
  return chats
    .filter((chat) => !chat.archived)
    .sort((a, b) => {
      const ap = a.pinnedAt ?? 0;
      const bp = b.pinnedAt ?? 0;
      if (ap || bp) {
        if (!ap) return 1;
        if (!bp) return -1;
        if (ap !== bp) return bp - ap;
      }
      return b.updatedAt - a.updatedAt;
    });
}

export function GlobalShortcuts() {
  const { activeTab, setActiveTab, activeChatId, selectChat, chats, togglePinChat, openSettings } = useKodeWorkspace();
  const { theme, setTheme } = useTheme();

  // Chat history for Back / Forward.
  const back = useRef<Place[]>([]);
  const forward = useRef<Place[]>([]);
  const current = useRef<Place | null>(null);
  const navigating = useRef(false);

  useEffect(() => {
    if (!activeChatId) return;
    const place = { tab: activeTab, chatId: activeChatId };
    const prev = current.current;
    if (prev && prev.tab === place.tab && prev.chatId === place.chatId) return;
    if (!navigating.current && prev) {
      back.current = [...back.current, prev].slice(-MAX_HISTORY);
      forward.current = [];
    }
    navigating.current = false;
    current.current = place;
  }, [activeTab, activeChatId]);

  const go = (from: typeof back, to: typeof forward) => {
    const target = from.current.at(-1);
    if (!target) return;
    from.current = from.current.slice(0, -1);
    if (current.current) to.current = [...to.current, current.current].slice(-MAX_HISTORY);
    navigating.current = true;
    if (target.tab !== activeTab) setActiveTab(target.tab);
    selectChat(target.chatId);
  };

  useKeybinding("nav.back", () => go(back, forward));
  useKeybinding("nav.forward", () => go(forward, back));

  const ordered = () => sidebarOrder(chats);
  const step = (delta: number) => {
    const list = ordered();
    if (!list.length) return;
    const index = list.findIndex((chat) => chat.id === activeChatId);
    const next = index < 0 ? (delta > 0 ? 0 : list.length - 1) : (index + delta + list.length) % list.length;
    selectChat(list[next].id);
  };
  useKeybinding("thread.next", () => step(1));
  useKeybinding("thread.previous", () => step(-1));

  // One registration per number; hooks can't be called in a loop safely, so
  // they're listed out.
  const jump = (n: number) => {
    const chat = ordered()[n - 1];
    if (chat) selectChat(chat.id);
  };
  useKeybinding("thread.jump1", () => jump(1));
  useKeybinding("thread.jump2", () => jump(2));
  useKeybinding("thread.jump3", () => jump(3));
  useKeybinding("thread.jump4", () => jump(4));
  useKeybinding("thread.jump5", () => jump(5));
  useKeybinding("thread.jump6", () => jump(6));
  useKeybinding("thread.jump7", () => jump(7));
  useKeybinding("thread.jump8", () => jump(8));
  useKeybinding("thread.jump9", () => jump(9));

  useKeybinding("thread.pin", () => {
    const chat = chats.find((c) => c.id === activeChatId);
    if (chat) void togglePinChat(chat.id, !chat.pinnedAt);
  });

  useKeybinding("usage.open", () => openSettings("usage"));

  useKeybinding("appearance.cycle", () => {
    const order = ["system", "light", "dark"] as const;
    const index = order.indexOf(theme as (typeof order)[number]);
    setTheme(order[(index + 1) % order.length]);
  });

  return null;
}
