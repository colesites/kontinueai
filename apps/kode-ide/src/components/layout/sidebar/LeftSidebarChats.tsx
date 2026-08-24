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
        <span className="text-[11.5px] font-medium text-[#7c7c82]">
          Recents
        </span>
        <button
          type="button"
          title="Filter recents"
          className="text-[#7c7c82] hover:text-white transition-colors"
        >
          <SlidersHorizontal size={12} strokeWidth={1.25} />
        </button>
      </div>

      {unfiledChats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.06] px-2 py-3 text-center text-[11.5px] text-[#5c5c62]">
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
              className="w-full text-left px-2 py-1 text-[11.5px] font-normal text-[#8e8e93] hover:text-white transition-colors cursor-pointer"
            >
              View more
            </button>
          )}
        </div>
      )}
    </section>
  );
}
