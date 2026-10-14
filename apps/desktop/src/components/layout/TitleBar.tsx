import { cn } from "@/lib/utils";

export function TitleBar({ className }: { className?: string }) {
  return (
    <div
      data-tauri-drag-region
      className={cn(
        "relative z-40 flex h-8 w-full shrink-0 select-none items-center justify-between px-4 transition-colors",
        "bg-purple-900/15 dark:bg-[#241738]/45 backdrop-blur-xl border-b border-purple-500/15",
        "pl-[78px]", // Clear native macOS traffic lights (red/yellow/green)
        className
      )}
    >
      {/* Center Title with subtle purple gradient text */}
      <div
        data-tauri-drag-region
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span
          data-tauri-drag-region
          className="text-[11.5px] font-medium tracking-tight text-foreground/70 dark:text-purple-200/70"
        >
          Kontinue AI
        </span>
      </div>

      {/* Right spacer / drag region */}
      <div data-tauri-drag-region className="ml-auto h-full flex-1" />
    </div>
  );
}

export default TitleBar;
