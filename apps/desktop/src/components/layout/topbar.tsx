import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";

type TopbarProps = {
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
};

export function Topbar({ panelOpen, onPanelChange }: TopbarProps) {
  return (
    <button
      type="button"
      title="Workspace panel (⌘J)"
      aria-label="Toggle workspace panel"
      aria-pressed={panelOpen}
      onClick={() => onPanelChange(!panelOpen)}
      className={cn(
        "flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors",
        panelOpen
          ? "kontinue-menu-active"
          : "kontinue-3d text-foreground/55 hover:text-foreground",
      )}
    >
      <PanelRight size={14} />
    </button>
  );
}
