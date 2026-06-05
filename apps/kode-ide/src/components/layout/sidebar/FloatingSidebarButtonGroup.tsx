import { useSidebar } from "@/components/ui/sidebar";
import { ArrowLeft, ArrowRight, PanelLeftOpen, SquarePen } from "lucide-react";

const FloatingSidebarButtonGroup = () => {
  const { toggleSidebar, state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";

  const iconBtn =
    "flex size-7 items-center justify-center rounded-lg text-foreground/55 transition-colors duration-150 hover:bg-white/[0.07] hover:text-foreground active:scale-95";

  return (
    <div className="fixed top-3 left-3 z-50 flex items-center">
      <div className="glass flex items-center gap-0.5 rounded-xl p-1">
        <button
          type="button"
          aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
          onClick={toggleSidebar}
          className={iconBtn}
        >
          <PanelLeftOpen
            size={16}
            className={`transition-transform duration-300 ${sidebarCollapsed ? "" : "rotate-180"}`}
          />
        </button>

        <span className="mx-0.5 h-4 w-px bg-white/[0.08]" />

        <button type="button" aria-label="Back" className={iconBtn}>
          <ArrowLeft size={16} />
        </button>
        <button type="button" aria-label="Forward" className={iconBtn}>
          <ArrowRight size={16} />
        </button>

        {/* New chat appears only when the sidebar is collapsed */}
        <div
          className={`grid transition-all duration-300 ${
            sidebarCollapsed
              ? "ml-0.5 grid-cols-[1fr] opacity-100"
              : "grid-cols-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <button
              type="button"
              aria-label="New chat"
              className={`${iconBtn} text-brand hover:text-brand`}
            >
              <SquarePen size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloatingSidebarButtonGroup;
