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
    "flex size-6 items-center justify-center rounded-full text-purple-900 dark:text-purple-100 transition-colors duration-150 hover:bg-purple-500/15 active:scale-95 cursor-pointer";

  if (!sidebarCollapsed) return null;

  return (
    <>
      <div className="absolute top-[9px] left-3.5 z-50 flex items-center">
        <div className="flex items-center gap-1 kontinue-capsule p-1">
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

          <span className="mx-0.5 h-3.5 w-px bg-purple-400/30" />

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
