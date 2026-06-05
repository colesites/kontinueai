import LeftSidebarChats from "./LeftSidebarChats";
import LeftSidebarProjects from "./LeftSidebarProjects";

const LeftSidebarContent = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pt-4 pb-3">
      <LeftSidebarProjects />
      <LeftSidebarChats />
    </div>
  );
};

export default LeftSidebarContent;
