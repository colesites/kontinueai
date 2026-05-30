"use client";

import { cn } from "@repo/ui/lib/utils";
import { ConnectorLogo } from "../../connectors/components/ConnectorLogo";
import type { MentionItem } from "../hooks/use-connector-mentions";

export function MentionMenu({
  items,
  activeIndex,
  onSelect,
  onHover,
}: {
  items: MentionItem[];
  activeIndex: number;
  onSelect: (item: MentionItem) => void;
  onHover: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="absolute bottom-full left-2 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-foreground/10 bg-popover/95 p-1 shadow-lg backdrop-blur-xl">
      <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Connectors
      </p>
      {items.map((item, i) => (
        <button
          key={item.provider}
          type="button"
          // Use onMouseDown so selection fires before the textarea blurs.
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          onMouseEnter={() => onHover(i)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
            i === activeIndex ? "bg-foreground/8" : "hover:bg-foreground/5",
          )}
        >
          <ConnectorLogo logo={item.logo} alt={item.name} size={18} />
          <span className="flex-1 truncate">{item.name}</span>
          {item.accountLabel && (
            <span className="truncate text-xs text-muted-foreground">
              @{item.accountLabel}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
