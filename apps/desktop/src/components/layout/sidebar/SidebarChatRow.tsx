import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKodeWorkspace, type KodeChat } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import { Check, Folder, FolderInput, MoreHorizontal, Pencil, Pin, PinOff, Share2, Trash2 } from "lucide-react";
import { ChatStatusIndicator } from "./ChatStatusIndicator";
import { KODE_CHAT_DRAG_TYPE } from "@/components/chat/ChatInput";
import { ShareModal } from "@/components/chat/ShareModal";

/** Compact age: 5m, 3h, 2d, 3w, 4mo, 2y. */
export const formatWhen = (timestamp: number) => {
  const diff = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < week) return `${Math.floor(diff / day)}d`;
  if (diff < month) return `${Math.floor(diff / week)}w`;
  if (diff < year) return `${Math.floor(diff / month)}mo`;
  return `${Math.floor(diff / year)}y`;
};

const SidebarChatRow = ({ chat }: { chat: KodeChat }) => {
  const {
    activeTab,
    setActiveTab,
    activeChatId,
    selectChat,
    togglePinChat,
    deleteChat,
    renameChat,
    folders,
    assignChatsToFolder,
  } = useKodeWorkspace();
  const inKode = activeTab === "kode";
  const isActive = activeChatId === chat.id;
  const isPinned = chat.pinnedAt !== null;
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [sharing, setSharing] = useState(false);

  const handleSaveRename = async () => {
    setIsRenaming(false);
    if (title.trim() && title.trim() !== chat.title) {
      await renameChat(chat.id, title.trim());
    } else {
      setTitle(chat.title);
    }
  };

  return (
    <div
      // Kode chats can be dragged into the composer to share their context.
      draggable={inKode && !isRenaming}
      onDragStart={(e) => {
        e.dataTransfer.setData(KODE_CHAT_DRAG_TYPE, JSON.stringify({ id: chat.id, title: chat.title }));
        e.dataTransfer.setData("text/plain", chat.title);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "group/chat flex h-[30px] items-center gap-1.5 rounded-full border pr-1.5 pl-2.5 text-body transition-colors",
        isActive
          ? "kontinue-capsule font-medium text-purple-950 dark:text-purple-100"
          : "border-transparent text-zinc-600 kontinue-hover hover:text-zinc-950 dark:text-muted-foreground dark:hover:text-foreground",
      )}
    >
      {isRenaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChatStatusIndicator chatId={chat.id} isPinned={isPinned} />
          <input
            type="text"
            value={title}
            aria-label="Chat title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void handleSaveRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSaveRename();
              if (e.key === "Escape") {
                setTitle(chat.title);
                setIsRenaming(false);
              }
            }}
            className="h-6 w-full min-w-0 rounded-md border border-[var(--brand)] bg-background px-1.5 text-body text-foreground outline-none"
            // biome-ignore lint/a11y/noAutofocus: rename was just chosen from the menu
            autoFocus
          />
        </div>
      ) : (
        <button
          type="button"
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            if (activeTab !== "home" && !inKode) setActiveTab("home");
            selectChat(chat.id);
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChatStatusIndicator chatId={chat.id} isPinned={isPinned} />
          <span className="min-w-0 flex-1 truncate">{chat.title}</span>
        </button>
      )}

      <span className="shrink-0 pr-1 text-caption tabular-nums text-foreground/35 group-hover/chat:hidden group-has-[[data-state=open]]/chat:hidden">
        {formatWhen(chat.updatedAt)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${chat.title}`}
            className="hidden size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground group-hover/chat:flex data-[state=open]:flex data-[state=open]:text-foreground"
          >
            <MoreHorizontal size={14} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={4} className="w-48">
          <DropdownMenuItem onSelect={() => void togglePinChat(chat.id, !isPinned)}>
            {isPinned ? <PinOff /> : <Pin />}
            <span>{isPinned ? "Unpin" : "Pin"}</span>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={() => setIsRenaming(true)}>
            <Pencil />
            <span>Rename</span>
          </DropdownMenuItem>

          {/* Share links are served by the web app, which only has Home chats. */}
          {inKode ? null : (
            <DropdownMenuItem onSelect={() => setSharing(true)}>
              <Share2 />
              <span>Share</span>
            </DropdownMenuItem>
          )}

          {/* Kode threads are filed under local project folders. */}
          {inKode && folders.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput />
                <span>Move to project</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    disabled={folder.id === chat.projectId}
                    onSelect={() => assignChatsToFolder([chat.id], folder.id)}
                  >
                    <Folder />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    {folder.id === chat.projectId ? <Check /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onSelect={() => void deleteChat(chat.id)}>
            <Trash2 />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {sharing ? (
        <ShareModal isOpen onClose={() => setSharing(false)} chatId={chat.id} chatTitle={chat.title} />
      ) : null}
    </div>
  );
};

export default SidebarChatRow;
