"use client";

import { ShareModal } from "../ShareModal";
import { SidebarChatRow } from "./SidebarChatRow";
import { SidebarChat } from "./sidebar-chat-types";
import { useSidebarChatActions } from "./useSidebarChatActions";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@repo/ui/components/ui/sidebar";

type SidebarChatsSectionProps = {
  chats: SidebarChat[] | undefined;
  isLoading: boolean;
  pathname: string;
  debouncedQuery: string;
  onNavigate: () => void;
};

export function SidebarChatsSection({
  chats,
  isLoading,
  pathname,
  debouncedQuery,
  onNavigate,
}: SidebarChatsSectionProps) {
  const hasChats = (chats?.length ?? 0) > 0;
  const actions = useSidebarChatActions({ chats, pathname });

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="px-2 eyebrow">
          {debouncedQuery.trim() ? "Search Results" : "Recent Chats"}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              chats?.map((chat) => (
                <SidebarChatRow
                  key={chat._id}
                  chat={chat}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  isRenaming={actions.renamingChatId === chat._id}
                  isBusy={actions.busyChatId === chat._id}
                  renameValue={actions.renameValue}
                  onRenameChange={actions.setRenameValue}
                  onRenameSubmit={() => void actions.handleRenameSubmit(chat)}
                  onRenameCancel={actions.closeRename}
                  onStartRename={() => actions.startRename(chat)}
                  onTogglePin={() => void actions.handleTogglePin(chat)}
                  onShare={() => actions.setShareChat(chat)}
                  onDelete={() => void actions.handleDelete(chat)}
                />
              ))
            )}
          </SidebarMenu>

          {!hasChats && !isLoading && (
            <p className="mt-4 rounded-xl border border-dashed border-sidebar-border/60 px-3 py-4 text-center text-xs text-sidebar-foreground/60">
              {debouncedQuery.trim()
                ? `No results found for "${debouncedQuery}"`
                : "No chats yet. Import a conversation to get started."}
            </p>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {actions.shareChat ? (
        <ShareModal
          isOpen={!!actions.shareChat}
          onClose={() => actions.setShareChat(null)}
          chatId={actions.shareChat._id}
          chatTitle={actions.shareChat.title}
        />
      ) : null}
    </>
  );
}
