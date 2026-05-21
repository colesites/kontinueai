"use client";

import { cn } from "@repo/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

export function ModeButton({
  children,
  active,
  disabled,
  tooltip,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled: boolean;
  tooltip?: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-tight transition-all duration-300",
        disabled
          ? "cursor-not-allowed opacity-20"
          : active
            ? "bg-foreground text-background shadow-xl scale-105"
            : "bg-secondary/40 text-foreground/50 hover:bg-secondary hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-popover text-popover-foreground border-border"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider">
          {tooltip || (active ? `Current: ${children}` : `Select ${children}`)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function PillButton({
  children,
  active,
  onClick,
  icon,
  tooltip,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-tight transition-all duration-300",
            active
              ? "bg-foreground text-background shadow-xl scale-105"
              : "bg-secondary/40 text-foreground/50 hover:bg-secondary hover:text-foreground"
          )}
        >
          {icon}
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-popover text-popover-foreground border-border"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider">
          {tooltip}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <div className={cn("mx-1 h-6 w-px shrink-0 bg-border/50", className)} />
  );
}
