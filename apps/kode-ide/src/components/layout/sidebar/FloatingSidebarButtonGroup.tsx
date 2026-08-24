import { useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { PanelLeft, Search, Plus } from "lucide-react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { SearchModal } from "@/components/search/SearchModal";

const FloatingSidebarButtonGroup = () => {
  const { toggleSidebar, state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";
  const { newChat } = useKodeWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);

  const iconBtn =
    "flex size-6 items-center justify-center rounded-md text-white/55 transition-all duration-150 hover:bg-white/[0.08] hover:text-white active:scale-95";

  if (!sidebarCollapsed) return null;

  return (
    <>
      <div className="absolute top-[8px] left-[8px] z-50 flex items-center">
        <div className="flex items-center gap-1 rounded-lg bg-[#161618]/90 border border-white/[0.06] p-0.5 shadow-lg backdrop-blur-md">
          {/* 1. Sidebar Toggle Icon */}
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={toggleSidebar}
            className={iconBtn}
            title="Open sidebar"
          >
            <PanelLeft size={13.5} strokeWidth={1.25} />
          </button>

          {/* 2. Search Icon */}
          <button
            type="button"
            aria-label="Search threads"
            onClick={() => setSearchOpen(true)}
            className={iconBtn}
            title="Search threads"
          >
            <Search size={13.5} strokeWidth={1.25} />
          </button>

          <span className="mx-0.5 h-3.5 w-px bg-white/[0.08]" />

          {/* 3. New Chat (+) Button */}
          <button
            type="button"
            aria-label="New chat"
            onClick={() => newChat()}
            className={iconBtn}
            title="New chat"
          >
            <Plus size={13.5} strokeWidth={1.25} />
          </button>
        </div>
      </div>

      {/* Reusable Glassmorphic Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};

export default FloatingSidebarButtonGroup;
