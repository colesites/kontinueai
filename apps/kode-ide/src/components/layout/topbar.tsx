import { UserButton } from "@clerk/clerk-react";
import {
  ChevronDown,
  Code2,
  Info,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Square,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TopbarProps = {
  bottomPanelOpen: boolean;
  sidePanelOpen: boolean;
  onBottomPanelChange: (open: boolean) => void;
  onSidePanelChange: (open: boolean) => void;
};

const ideOptions = [
  "VS Code",
  "Cursor",
  "Zed",
  "Windsurf",
  "Finder",
  "Terminal",
  "Warp",
  "Xcode",
  "Android Studio",
  "RustRover",
  "PyCharm",
];

export function Topbar({
  bottomPanelOpen,
  sidePanelOpen,
  onBottomPanelChange,
  onSidePanelChange,
}: TopbarProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="flex items-center gap-3">
      {isCollapsed && (
        <IconButton label="Open sidebar" onClick={toggleSidebar}>
          <PanelLeft size={16} strokeWidth={1.25} />
        </IconButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Open in IDE"
            className="surface-raised flex h-10 items-center gap-2 rounded-xl px-3 text-foreground/78 backdrop-blur-xl transition-all hover:-translate-y-px hover:text-foreground"
          >
            <VSCodeMark />
            <ChevronDown size={16} className="text-foreground/45" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="glass-strong w-48 rounded-xl p-1 text-foreground"
        >
          {ideOptions.map((option, index) => (
            <DropdownMenuItem
              key={option}
              className="gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground/80 focus:bg-white/[0.07] focus:text-foreground"
            >
              <span className="flex size-4 items-center justify-center">
                {index === 0 ? (
                  <VSCodeMark small />
                ) : (
                  <Square size={13} className="text-foreground/35" />
                )}
              </span>
              <span>{option}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <IconButton label="Project info">
        <Info size={19} />
      </IconButton>
      <IconButton
        label="Toggle bottom panel"
        active={bottomPanelOpen}
        onClick={() => onBottomPanelChange(!bottomPanelOpen)}
      >
        <PanelBottom size={19} />
      </IconButton>
      <IconButton
        label="Toggle side panel"
        active={sidePanelOpen}
        onClick={() => onSidePanelChange(!sidePanelOpen)}
      >
        <PanelRight size={19} />
      </IconButton>
      <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.035] ring-1 ring-white/[0.06]">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "size-7",
              userButtonPopoverCard:
                "border border-white/[0.08] bg-[var(--surface-1)] text-foreground shadow-2xl",
              userButtonPopoverActionButton:
                "text-foreground/72 hover:bg-white/[0.06] hover:text-foreground",
            },
          }}
        />
      </div>
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
      className="flex size-10 items-center justify-center rounded-xl text-foreground/50 transition-all hover:-translate-y-px hover:bg-white/[0.055] hover:text-foreground/78 aria-pressed:bg-white/[0.095] aria-pressed:text-foreground aria-pressed:shadow-[inset_0_1px_0_oklch(1_0_0/0.1),0_12px_28px_-18px_oklch(0_0_0/0.9)]"
    >
      {children}
    </button>
  );
}

function VSCodeMark({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center rounded-[4px] bg-white/[0.08] ring-1 ring-white/10",
        small ? "size-4" : "size-5",
      )}
    >
      <Code2
        size={small ? 11 : 13}
        strokeWidth={2.25}
        className="text-foreground/70"
      />
    </span>
  );
}
