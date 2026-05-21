import Link from "next/link";
import { MessageCircle, Check } from "lucide-react";
import { LuPin } from "react-icons/lu";
import { SidebarChatActionsMenu } from "./SidebarChatActionsMenu";
import { SidebarChatRenameRow } from "./SidebarChatRenameRow";
import { SidebarChat } from "./sidebar-chat-types";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { cn } from "@repo/ui/lib/utils";
import { type Provider, PROVIDER_CONFIG } from "@repo/utils/url-safety";

type SidebarChatRowProps = {
  chat: SidebarChat;
  pathname: string;
  onNavigate: () => void;
  isRenaming: boolean;
  isBusy: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onTogglePin: () => void;
  onShare: () => void;
  onDelete: () => void;
};

export function SidebarChatRow({
  chat,
  pathname,
  onNavigate,
  isRenaming,
  isBusy,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onStartRename,
  onTogglePin,
  onShare,
  onDelete,
}: SidebarChatRowProps) {
  const isActive = pathname === `/chat/${chat._id}`;
  const provider = chat.source?.provider as Provider | undefined;
  const providerColor = provider ? PROVIDER_CONFIG[provider]?.color : undefined;

  return (
    <SidebarMenuItem>
      {isRenaming ? (
        <SidebarChatRenameRow
          providerColor={providerColor}
          isActive={isActive}
          isBusy={isBusy}
          renameValue={renameValue}
          onRenameChange={onRenameChange}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
        />
      ) : (
        <>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={chat.title}
            className={cn(
              "group h-9 rounded-xl px-2 pr-9 text-[13px] transition-all duration-150",
              // Override default sidebar-accent hover with our subtler foreground tint
              "hover:bg-foreground/5 hover:text-sidebar-foreground",
              // Active state — primary tint + soft glow
              "data-[active=true]:bg-primary/8 data-[active=true]:hover:bg-primary/12",
              "data-[active=true]:text-foreground data-[active=true]:font-medium",
              "data-[active=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_20%,transparent),0_2px_8px_-4px_color-mix(in_oklch,var(--primary)_30%,transparent)]"
            )}
          >
            <Link
              href={`/chat/${chat._id}`}
              onClick={onNavigate}
              className="flex items-center gap-2.5"
            >
              {/* Provider chip */}
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md transition-colors",
                  isActive
                    ? "bg-primary/15 ring-1 ring-primary/25"
                    : "bg-foreground/5 ring-1 ring-foreground/8 group-hover:bg-foreground/8"
                )}
              >
                <MessageCircle
                  size={11}
                  strokeWidth={2.25}
                  style={{
                    color: isActive
                      ? undefined
                      : providerColor ?? "currentColor",
                  }}
                  className={isActive ? "text-primary" : ""}
                />
              </span>

              {/* Title */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate flex-1">{chat.title}</span>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p className="max-w-[280px] text-xs">{chat.title}</p>
                </TooltipContent>
              </Tooltip>

              {/* Pinned indicator (when not active) */}
              {chat.pinnedAt && !isActive && (
                <LuPin className="h-3 w-3 shrink-0 text-primary/70" />
              )}

              {/* Active check chip — same language as model picker */}
              {isActive && (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_4px_-1px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
                  <Check className="size-2.5" strokeWidth={3.5} />
                </span>
              )}
            </Link>
          </SidebarMenuButton>
          <SidebarChatActionsMenu
            chat={chat}
            isBusy={isBusy}
            onTogglePin={onTogglePin}
            onStartRename={onStartRename}
            onShare={onShare}
            onDelete={onDelete}
          />
        </>
      )}
    </SidebarMenuItem>
  );
}
