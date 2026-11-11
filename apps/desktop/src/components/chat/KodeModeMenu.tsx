// Kode permission mode picker. Used by the composer and Settings → General /
// Snapshots, so both show the same control.

import { Check, ChevronDown, ClipboardList, FileEdit, Lock, Palette, Sparkles, Zap } from "lucide-react";
import type React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverInfo, HoverInfoProvider } from "@/components/ui/hover-info";
import { KODE_AGENT_MODES, type KodeAgentMode } from "@/lib/kode-tools";
import { cn } from "@/lib/utils";

export const MODE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  supervised: Lock,
  auto_edits: FileEdit,
  auto: Sparkles,
  full_access: Zap,
  design: Palette,
  ask: Lock,
  plan: ClipboardList,
};

export function KodeModeMenu({
  mode,
  onModeChange,
  side = "top",
  align = "start",
  showStyle = true,
  hint = "⇧Tab to switch modes",
}: {
  mode: KodeAgentMode | undefined;
  onModeChange?: (mode: KodeAgentMode) => void;
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Show the "Style" group (Design). */
  showStyle?: boolean;
  hint?: string | null;
}) {
  const activeMode = KODE_AGENT_MODES.find((m) => m.id === mode) ?? KODE_AGENT_MODES[0];
  const ModeIcon = (mode && MODE_ICON_MAP[mode]) || Lock;
  const groups = [
    { title: "Permissions", items: KODE_AGENT_MODES.filter((m) => m.id !== "design" && m.id !== "ask") },
    ...(showStyle ? [{ title: "Style", items: KODE_AGENT_MODES.filter((m) => m.id === "design") }] : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Execution mode: ${activeMode?.label ?? "Supervised"}`}
          className="flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full liquid-glass-pill px-2.5 text-xs text-zinc-800 dark:text-foreground/80"
        >
          <ModeIcon className="size-3.5 text-purple-700 dark:text-foreground/80" />
          <span className="font-semibold text-zinc-900 dark:text-foreground">{activeMode?.label ?? "Supervised"}</span>
          <ChevronDown size={11} className="ml-0.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} sideOffset={8} className="w-72 select-none p-1.5">
        <HoverInfoProvider>
          {groups.map((group, groupIndex) => (
            <div key={group.title}>
              {groupIndex > 0 ? <div className="my-1.5 h-px bg-black/[0.06] dark:bg-white/[0.06]" /> : null}
              <p className="px-3 pt-1 pb-1 text-caption font-medium text-muted-foreground/70">{group.title}</p>
              {group.items.map((modeOption) => {
                const IconComponent = MODE_ICON_MAP[modeOption.id] || Lock;
                const isSelected = modeOption.id === mode;
                const risky = modeOption.id === "full_access";
                // Design (AI canvas → handoff to the coding agent) is coming later.
                const comingSoon = modeOption.id === "design";
                return (
                  <HoverInfo
                    key={modeOption.id}
                    title={modeOption.label}
                    description={modeOption.description}
                    icon={<IconComponent className={cn("size-3.5 shrink-0", risky ? "text-amber-500" : "text-purple-500")} />}
                  >
                    <DropdownMenuItem
                      disabled={comingSoon}
                      onSelect={() => onModeChange?.(modeOption.id)}
                      className="flex w-full items-center gap-2.5 px-2 py-1.5"
                    >
                      <span
                        className={cn(
                          "kontinue-3d flex size-7 shrink-0 items-center justify-center rounded-full",
                          risky ? "text-amber-500" : isSelected ? "text-purple-500" : "text-foreground/70",
                        )}
                      >
                        <IconComponent className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium">{modeOption.label}</span>
                        <span className="block truncate text-caption text-muted-foreground">{modeOption.description}</span>
                      </span>
                      {comingSoon ? (
                        <span className="shrink-0 rounded-full border border-black/10 px-1.5 text-micro font-medium text-muted-foreground dark:border-white/10">
                          Soon
                        </span>
                      ) : isSelected ? (
                        <Check size={13} className="shrink-0 text-purple-500" />
                      ) : null}
                    </DropdownMenuItem>
                  </HoverInfo>
                );
              })}
            </div>
          ))}
        </HoverInfoProvider>
        {hint ? <p className="px-3 pt-1.5 pb-0.5 text-micro text-muted-foreground/60">{hint}</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
