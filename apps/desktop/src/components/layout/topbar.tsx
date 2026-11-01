import { PanelBottom, PanelRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TopbarProps = {
  bottomPanelOpen: boolean;
  sidePanelOpen: boolean;
  onBottomPanelChange: (open: boolean) => void;
  onSidePanelChange: (open: boolean) => void;
};

export function Topbar({
  bottomPanelOpen,
  sidePanelOpen,
  onBottomPanelChange,
  onSidePanelChange,
}: TopbarProps) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        label="Toggle bottom panel"
        active={bottomPanelOpen}
        onClick={() => onBottomPanelChange(!bottomPanelOpen)}
      >
        <PanelBottom size={14} />
      </IconButton>
      <IconButton
        label="Toggle side panel"
        active={sidePanelOpen}
        onClick={() => onSidePanelChange(!sidePanelOpen)}
      >
        <PanelRight size={14} />
      </IconButton>
    </div>
  );
}

function IconButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ?? undefined}
      onClick={onClick}
      className={cn(
        "kontinue-3d flex size-7 items-center justify-center rounded-full text-foreground/55 transition-colors hover:text-foreground",
        active && "text-foreground ring-1 ring-white/10",
      )}
    >
      {children}
    </button>
  );
}
