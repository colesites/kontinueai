import { SquarePen, Search, Plug2 } from "lucide-react";

const LeftSidebarHeader = () => {
  return (
    <div className="px-3 pt-1">
      {/* Primary action */}
      <button
        type="button"
        className="bg-brand flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white transition-colors duration-150
          ring-1 ring-[color-mix(in_oklch,var(--brand)_55%,transparent)]
          hover:brightness-105 active:scale-[0.99]"
      >
        <SquarePen size={15} className="shrink-0" />
        <span>New chat</span>
      </button>

      {/* Secondary actions */}
      <div className="mt-2 flex items-stretch gap-1.5">
        <button
          type="button"
          className="surface-inset group flex h-9 flex-1 items-center gap-2 rounded-lg px-2.5 text-[12.5px] text-foreground/55 transition-colors hover:text-foreground"
        >
          <Search size={14} className="shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded-[5px] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-foreground/40 ring-1 ring-white/[0.06]">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          title="Plugins"
          aria-label="Plugins"
          className="surface-inset flex size-9 items-center justify-center rounded-lg text-foreground/55 transition-colors hover:text-foreground"
        >
          <Plug2 size={15} />
        </button>
      </div>

      <div className="mt-3 h-px bg-white/[0.07]" />
    </div>
  );
};

export default LeftSidebarHeader;
