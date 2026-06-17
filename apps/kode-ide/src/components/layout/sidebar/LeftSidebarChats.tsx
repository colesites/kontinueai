import { useConvexAuth } from "convex/react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import SidebarChatRow from "./SidebarChatRow";

const LeftSidebarChats = () => {
  const { chats, chatsLoading } = useKodeWorkspace();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  const unfiledChats = chats
    .filter((chat) => !chat.projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const emptyLabel = authLoading
    ? "Connecting..."
    : !isAuthenticated
      ? "Sign in to see your chats"
      : chatsLoading
        ? "Loading chats..."
        : "No chats yet";

  return (
    <section className="min-h-0 flex-1">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
        Chats
      </p>

      {unfiledChats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-6 text-center text-[12px] text-foreground/35">
          {emptyLabel}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {unfiledChats.map((chat) => (
            <SidebarChatRow key={chat.id} chat={chat} />
          ))}
        </div>
      )}
    </section>
  );
};

export default LeftSidebarChats;
