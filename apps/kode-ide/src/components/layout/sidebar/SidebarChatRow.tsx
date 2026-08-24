import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKodeWorkspace, type KodeChat } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  Pin,
  PinOff,
  Pencil,
  Share2,
  FolderInput,
  Trash2,
} from "lucide-react";
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
  if (diff < month) return `${Math.floor(diff / week)}mo`;
  return `${Math.floor(diff / month)}mo`;
};

const SidebarChatRow = ({ chat }: { chat: KodeChat }) => {
  const { activeTab, setActiveTab, activeChatId, selectChat, togglePinChat, deleteChat } =
    useKodeWorkspace();
  const isActive = activeChatId === chat.id;
  const isPinned = chat.pinnedAt !== null;
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(chat.title);

  return (
    <div
      className={cn(
        "group/chat flex items-center justify-between gap-2 rounded px-2.5 py-1 text-[11.5px] font-normal text-[#d1d1d6] transition-colors hover:bg-white/[0.05] hover:text-white h-[26px]",
        isActive && "bg-white/[0.07] text-white font-medium",
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (activeTab !== "home" && activeTab !== "kode") {
            setActiveTab("home");
          }
          selectChat(chat.id);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <ChatStatusIndicator chatId={chat.id} isPinned={isPinned} />
        {isRenaming ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setIsRenaming(false);
            }}
            className="w-full bg-black/50 px-1.5 py-0.5 rounded text-[11.5px] text-white outline-none"
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate">{chat.title}</span>
        )}
      </button>

      <span className="shrink-0 text-[10px] text-foreground/25 group-hover/chat:hidden">
        {formatWhen(chat.updatedAt)}
      </span>

      {/* 3-Dot Trigger Button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat actions"
            className="hidden shrink-0 size-5 flex items-center justify-center rounded-md text-white/50 hover:bg-white/[0.08] hover:text-white group-hover/chat:flex data-[state=open]:flex data-[state=open]:bg-white/[0.08] data-[state=open]:text-white transition-colors"
          >
            <MoreVertical size={13} strokeWidth={1.25} />
          </button>
        </DropdownMenuTrigger>

        {/* Dropdown Menu Card */}
        <DropdownMenuContent align="end" sideOffset={4} className="w-48">
          {/* 1. Pin / Unpin */}
          <DropdownMenuItem onClick={() => void togglePinChat(chat.id, !isPinned)}>
            {isPinned ? (
              <>
                <PinOff size={13.5} strokeWidth={1.25} />
                <span>Unpin</span>
              </>
            ) : (
              <>
                <Pin size={13.5} strokeWidth={1.25} />
                <span>Pin</span>
              </>
            )}
          </DropdownMenuItem>

          {/* 2. Rename */}
          <DropdownMenuItem onClick={() => setIsRenaming(true)}>
            <Pencil size={13.5} strokeWidth={1.25} />
            <span>Rename</span>
          </DropdownMenuItem>

          {/* 3. Share */}
          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(window.location.href)}>
            <Share2 size={13.5} strokeWidth={1.25} />
            <span>Share</span>
          </DropdownMenuItem>

          {/* 4. Move to project */}
          <DropdownMenuItem onClick={() => {}}>
            <FolderInput size={13.5} strokeWidth={1.25} />
            <span>Move to project</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* 5. Delete */}
          <DropdownMenuItem variant="destructive" onClick={() => void deleteChat(chat.id)}>
            <Trash2 size={13.5} strokeWidth={1.25} />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default SidebarChatRow;
