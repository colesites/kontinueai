import { MessageCircle } from "lucide-react";
import { LuCheck, LuX } from "react-icons/lu";
import { SidebarMenuButton } from "@repo/ui/components/ui/sidebar";
import { cn } from "@repo/ui/lib/utils";

type SidebarChatRenameRowProps = {
  providerColor?: string;
  isActive: boolean;
  isBusy: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
};

export function SidebarChatRenameRow({
  providerColor,
  isActive,
  isBusy,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: SidebarChatRenameRowProps) {
  return (
    <SidebarMenuButton
      isActive={isActive}
      className={cn(
        "h-10 border border-sidebar-border bg-sidebar-accent/30 px-3",
        "data-[active=true]:border-sidebar-border data-[active=true]:bg-sidebar-accent/40",
      )}
    >
      <MessageCircle size={16} style={{ color: providerColor }} />
      <form
        className="flex min-w-0 flex-1 items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onRenameSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={renameValue}
          onChange={(event) => onRenameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onRenameCancel();
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-sidebar-border/70 bg-sidebar px-2 text-xs text-sidebar-foreground outline-none ring-sidebar-ring focus:ring-2"
          maxLength={120}
          aria-label="Rename chat"
        />
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Save title"
        >
          <LuCheck className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRenameCancel}
          disabled={isBusy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Cancel rename"
        >
          <LuX className="h-4 w-4" />
        </button>
      </form>
    </SidebarMenuButton>
  );
}
