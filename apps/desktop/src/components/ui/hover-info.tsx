// Hover card for rows whose description is cut off (slash commands,
// permission modes). Same look as the model picker's tooltip.

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";

export function HoverInfoProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={450} skipDelayDuration={150}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function HoverInfo({
  title,
  description,
  icon,
  children,
  side = "right",
}: {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  side?: "right" | "left" | "top" | "bottom";
}) {
  if (!description) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align="center"
          sideOffset={16}
          collisionPadding={12}
          className="liquid-glass-dropdown z-[60] w-64 px-3.5 py-3 text-foreground animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center gap-2">
            {icon}
            <p className="truncate text-xs font-semibold">{title}</p>
          </div>
          <p className="mt-1.5 text-label leading-relaxed text-muted-foreground">{description}</p>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
