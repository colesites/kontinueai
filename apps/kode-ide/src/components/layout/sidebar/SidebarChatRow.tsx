import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKodeWorkspace, type KodeChat } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import { Archive, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { ChatStatusIndicator } from "./ChatStatusIndicator";

export const formatWhen = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < week) return `${Math.floor(diff / day)}d`;
  if (diff < month) return `${Math.floor(diff / week)}w`;
  return `${Math.floor(diff / month)}mo`;
};

const SidebarChatRow = ({ chat }: { chat: KodeChat }) => {
  const { activeChatId, selectChat, togglePinChat, archiveChat, deleteChat } =
    useKodeWorkspace();
  const isActive = activeChatId === chat.id;
  const isPinned = chat.pinnedAt !== null;

  return (
    <div
      className={cn(
        "group/chat flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-foreground/65 transition-colors hover:bg-white/[0.055] hover:text-foreground",
        isActive && "bg-white/[0.06] text-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => selectChat(chat.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <ChatStatusIndicator chatId={chat.id} isPinned={isPinned} />
        <span className="flex-1 truncate">{chat.title}</span>
      </button>

      <span className="shrink-0 text-[10px] text-foreground/25 group-hover/chat:hidden">
        {formatWhen(chat.updatedAt)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat actions"
            className="hidden shrink-0 rounded-md p-0.5 text-foreground/40 hover:text-foreground group-hover/chat:block data-[state=open]:block"
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => void togglePinChat(chat.id, !isPinned)}
          >
            {isPinned ? (
              <>
                <PinOff size={14} /> Unpin
              </>
            ) : (
              <>
                <Pin size={14} /> Pin
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void archiveChat(chat.id, true)}>
            <Archive size={14} /> Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void deleteChat(chat.id)}
          >
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default SidebarChatRow;
