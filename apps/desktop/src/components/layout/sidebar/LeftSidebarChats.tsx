import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import SidebarChatRow from "./SidebarChatRow";

export default function LeftSidebarChats() {
  const { chats, chatsLoading } = useKodeWorkspace();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const [limit, setLimit] = useState(20);

  const unfiledChats = [...chats]
    .filter((chat) => !chat.projectId)
    .sort((a, b) => {
      const aPinned = a.pinnedAt !== null && a.pinnedAt > 0;
      const bPinned = b.pinnedAt !== null && b.pinnedAt > 0;

      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
      }
      return b.updatedAt - a.updatedAt;
    });

  const displayedChats = unfiledChats.slice(0, limit);

  const emptyLabel = authLoading
    ? "Connecting…"
    : !isAuthenticated
      ? "Sign in to see your chats"
      : chatsLoading
        ? "Loading…"
        : "Chats you start show up here";

  return (
    <section aria-label="Recents" className="pt-1.5">
      <h2 className="mb-1 flex h-6 items-center px-2 text-label font-medium text-muted-foreground">Recents</h2>

      {unfiledChats.length === 0 ? (
        <p className="px-2 py-1.5 text-label text-muted-foreground/80">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-px">
          {displayedChats.map((chat) => (
            <SidebarChatRow key={chat.id} chat={chat} />
          ))}
          {unfiledChats.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((prev) => prev + 20)}
              className="h-7 w-full rounded-full px-2.5 text-left text-label text-muted-foreground transition-colors hover:text-foreground"
            >
              Show more
            </button>
          )}
        </div>
      )}
    </section>
  );
}
