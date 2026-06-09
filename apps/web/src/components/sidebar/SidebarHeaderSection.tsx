import Link from "next/link";
import Image from "next/image";
import {
  MessageSquarePlus,
  Search as SearchIcon,
  X,
  Palette,
  ListChecks,
  Bot,
  Plug,
} from "lucide-react";
import {
  SidebarHeader,
  SidebarInput,
  SidebarTrigger,
} from "@repo/ui/components/ui/sidebar";
import { cn } from "@repo/ui/lib/utils";
import { NotificationsBell } from "./NotificationsBell";

type SidebarHeaderSectionProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onNavigate: () => void;
};

export function SidebarHeaderSection({
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
  onNavigate,
}: SidebarHeaderSectionProps) {
  return (
    <SidebarHeader className="border-b border-foreground/6 -mx-2 px-5 py-3.5 gap-3.5">
      {/* Brand row */}
      <div className="flex items-center justify-between gap-2">
        <Link href="/" onClick={onNavigate} className="flex items-center" aria-label="Kontinue AI home">
          <Image
            src="/kontinueai.svg"
            alt="Kontinue AI"
            width={110}
            height={22}
            priority
            className="h-5 w-auto invert dark:invert-0 transition-[filter]"
          />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <SidebarTrigger
            aria-label="Close sidebar"
            className="size-7 rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground"
          />
        </div>
      </div>

      {/* Search — top of stack, since it's the most-used action */}
      <div className="relative">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
        />
        <SidebarInput
          id="sidebar-thread-search"
          placeholder="Search threads…"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className={cn(
            "surface-inset h-10 rounded-xl pl-9 pr-12 text-[13px] text-sidebar-foreground placeholder:text-muted-foreground/55 transition-all duration-200",
            "focus-visible:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary/30"
          )}
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={onClearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        ) : (
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 px-1.5 rounded-md text-[10px] font-medium text-muted-foreground/60 bg-foreground/5 ring-1 ring-foreground/8 font-mono"
          >
            ⌘K
          </kbd>
        )}
      </div>

      {/* Action area: primary New chat + Canvas on top, Tasks + Agents below */}
      <div className="flex flex-col gap-2">
        {/* Row 1: primary New chat + secondary Canvas icon */}
        <div className="flex items-stretch gap-2">
          <Link
            href="/"
            onClick={onNavigate}
            aria-label="Start new chat"
            className={cn(
              "group relative flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-all duration-200 overflow-hidden",
              "bg-linear-to-br from-primary to-primary/85 text-primary-foreground",
              "ring-1 ring-primary/30",
              "shadow-[0_3px_10px_-2px_color-mix(in_oklch,var(--primary)_45%,transparent),0_0_24px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent),inset_0_1px_0_color-mix(in_oklch,white_22%,transparent)]",
              "hover:scale-[1.015]",
              "hover:shadow-[0_5px_14px_-2px_color-mix(in_oklch,var(--primary)_55%,transparent),0_0_32px_-6px_color-mix(in_oklch,var(--primary)_70%,transparent),inset_0_1px_0_color-mix(in_oklch,white_30%,transparent)]",
              "active:scale-[0.98]"
            )}
          >
            {/* shimmer sweep on hover */}
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <MessageSquarePlus
              size={16}
              className="relative transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110"
            />
            <span className="relative">New chat</span>
          </Link>

          <Link
            href="/canvas"
            onClick={onNavigate}
            aria-label="Open Canvas"
            title="Open Canvas"
            className={cn(
              "group flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
              "surface-inset text-muted-foreground",
              "hover:bg-foreground/8 hover:text-foreground hover:scale-[1.04]",
              "active:scale-[0.96]"
            )}
          >
            <Palette
              size={15}
              className="transition-transform duration-300 group-hover:rotate-12"
            />
          </Link>
        </div>

        {/* Row 2: Tasks + Agents */}
        <div className="flex items-stretch gap-2">
          <Link
            href="/tasks"
            onClick={onNavigate}
            aria-label="Open Tasks"
            title="Open Tasks"
            className={cn(
              "group flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all duration-200",
              "surface-inset text-muted-foreground",
              "hover:bg-foreground/8 hover:text-foreground hover:scale-[1.015]",
              "active:scale-[0.98]"
            )}
          >
            <ListChecks
              size={15}
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <span>Tasks</span>
          </Link>

          <Link
            href="/agents"
            onClick={onNavigate}
            aria-label="Open Agents"
            title="Open Agents"
            className={cn(
              "group flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all duration-200",
              "surface-inset text-muted-foreground",
              "hover:bg-foreground/8 hover:text-foreground hover:scale-[1.015]",
              "active:scale-[0.98]"
            )}
          >
            <Bot
              size={15}
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <span>Agents</span>
          </Link>
        </div>

        {/* Row 3: Connectors */}
        <div className="flex items-stretch">
          <Link
            href="/settings/connectors"
            onClick={onNavigate}
            aria-label="Open Connectors"
            title="Open Connectors"
            className={cn(
              "group flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all duration-200",
              "surface-inset text-muted-foreground",
              "hover:bg-foreground/8 hover:text-foreground hover:scale-[1.015]",
              "active:scale-[0.98]"
            )}
          >
            <Plug
              size={15}
              className="transition-transform duration-300 group-hover:scale-110"
            />
            <span>Connectors</span>
          </Link>
        </div>
      </div>
    </SidebarHeader>
  );
}
