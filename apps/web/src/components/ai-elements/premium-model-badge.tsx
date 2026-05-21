"use client";

import { IoDiamondOutline } from "react-icons/io5";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { cn } from "@repo/ui/lib/utils";

export function PremiumModelBadge({
  className,
  tooltip = "Pro model",
}: {
  className?: string;
  tooltip?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center justify-center size-4 rounded-full bg-linear-to-br from-primary/25 to-primary/10 text-primary ring-1 ring-primary/25 shadow-[0_1px_2px_-1px_color-mix(in_oklch,var(--primary)_60%,transparent)]",
            className
          )}
        >
          <IoDiamondOutline className="size-2.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
