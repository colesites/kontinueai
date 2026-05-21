import { FiMoreHorizontal } from "react-icons/fi";
import { LuPencil, LuPin, LuPinOff, LuShare2, LuTrash2 } from "react-icons/lu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { SidebarMenuAction } from "@repo/ui/components/ui/sidebar";
import { SidebarChat } from "./sidebar-chat-types";

type SidebarChatActionsMenuProps = {
  chat: SidebarChat;
  isBusy: boolean;
  onTogglePin: () => void;
  onStartRename: () => void;
  onShare: () => void;
  onDelete: () => void;
};

export function SidebarChatActionsMenu({
  chat,
  isBusy,
  onTogglePin,
  onStartRename,
  onShare,
  onDelete,
}: SidebarChatActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          className="top-2 h-6 w-6 rounded-md"
          aria-label={`Open actions for ${chat.title}`}
        >
          <FiMoreHorizontal className="h-4 w-4" />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="right"
        className="w-44 border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <DropdownMenuItem disabled={isBusy} onClick={onTogglePin}>
          {chat.pinnedAt ? <LuPinOff className="h-4 w-4" /> : <LuPin className="h-4 w-4" />}
          <span>{chat.pinnedAt ? "Unpin" : "Pin"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isBusy} onClick={onStartRename}>
          <LuPencil className="h-4 w-4" />
          <span>Rename</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isBusy} onClick={onShare}>
          <LuShare2 className="h-4 w-4" />
          <span>Share</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-sidebar-border/80" />
        <DropdownMenuItem variant="destructive" disabled={isBusy} onClick={onDelete}>
          <LuTrash2 className="h-4 w-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
