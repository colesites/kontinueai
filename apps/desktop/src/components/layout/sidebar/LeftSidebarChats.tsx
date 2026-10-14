import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { SlidersHorizontal } from "lucide-react";
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
    ? "Connecting..."
    : !isAuthenticated
      ? "Sign in to view threads"
      : chatsLoading
        ? "Loading recents..."
        : "No recents yet";

  return (
    <section className="space-y-1 pt-1.5">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          Recents
        </span>
        <button
          type="button"
          title="Filter recents"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <SlidersHorizontal size={12} strokeWidth={1.25} />
        </button>
      </div>

      {unfiledChats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[11.5px] text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {displayedChats.map((chat) => (
            <SidebarChatRow key={chat.id} chat={chat} />
          ))}
          {unfiledChats.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((prev) => prev + 20)}
              className="w-full text-left px-2 py-1 text-[11.5px] font-normal text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              View more
            </button>
          )}
        </div>
      )}
    </section>
  );
}
