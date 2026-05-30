import { FiMoreHorizontal } from "react-icons/fi";
import {
  LuFolderInput,
  LuFolderMinus,
  LuPencil,
  LuPin,
  LuPinOff,
  LuShare2,
  LuTrash2,
} from "react-icons/lu";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  const projects = useQuery(api.projects.listProjects, {});
  const assignChatToProject = useMutation(api.projects.assignChatToProject);
  const currentProjectId = chat.projectId ?? null;

  const handleMove = async (projectId: Id<"projects"> | null) => {
    try {
      await assignChatToProject({ chatId: chat._id, projectId });
      toast.success(projectId ? "Moved to project" : "Removed from project");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move chat");
    }
  };

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

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isBusy}>
            <LuFolderInput className="h-4 w-4" />
            <span>Move to project</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-64 w-48 overflow-y-auto border-sidebar-border bg-sidebar text-sidebar-foreground">
            {currentProjectId && (
              <>
                <DropdownMenuItem onClick={() => void handleMove(null)}>
                  <LuFolderMinus className="h-4 w-4" />
                  <span>Remove from project</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-sidebar-border/80" />
              </>
            )}
            {projects === undefined ? (
              <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
            ) : projects.length === 0 ? (
              <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
            ) : (
              projects.map((project) => (
                <DropdownMenuItem
                  key={project._id}
                  disabled={project._id === currentProjectId}
                  onClick={() => void handleMove(project._id)}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color ?? "#888" }}
                  />
                  <span className="truncate">{project.name}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator className="bg-sidebar-border/80" />
        <DropdownMenuItem variant="destructive" disabled={isBusy} onClick={onDelete}>
          <LuTrash2 className="h-4 w-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
