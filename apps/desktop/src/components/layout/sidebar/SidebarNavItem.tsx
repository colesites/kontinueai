// One row of the sidebar's main navigation (New, Canvas, Tasks, …). Every
// destination uses this so height, type, icon size and the active capsule
// stay identical.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared geometry for sidebar rows, also used by chat and project rows. */
export const SIDEBAR_ICON = { size: 15, strokeWidth: 1.5 } as const;

export function SidebarNavItem({
  icon: Icon,
  label,
  active = false,
  onClick,
  trailing,
  title,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  /** Right-aligned extra: a count or a shortcut hint. */
  trailing?: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-full border px-2.5 text-left text-body transition-colors",
        active
          ? "kontinue-capsule font-medium text-purple-900 dark:text-purple-100"
          : "border-transparent text-zinc-600 kontinue-hover hover:text-zinc-950 dark:text-muted-foreground dark:hover:text-foreground",
      )}
    >
      <Icon {...SIDEBAR_ICON} className={cn("shrink-0", active && "text-purple-600 dark:text-purple-300")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}
