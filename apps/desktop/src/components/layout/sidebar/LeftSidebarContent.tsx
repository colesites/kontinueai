import LeftSidebarChats from "./LeftSidebarChats";
import LeftSidebarProjects from "./LeftSidebarProjects";
import { useKodeWorkspace } from "@/lib/kode-workspace";

const LeftSidebarContent = () => {
  const { activeTab } = useKodeWorkspace();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pt-3 pb-2">
      <LeftSidebarProjects />
      {/* Kode works like Claude Code: chats live under their project folder,
          so there is no separate Recents list there. */}
      {activeTab !== "kode" && <LeftSidebarChats />}
    </div>
  );
};

export default LeftSidebarContent;
