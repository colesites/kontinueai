import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import LeftSidebarHeader from "./LeftSidebarHeader";
import LeftSidebarContent from "./LeftSidebarContent";
import LeftSidebarFooter from "./LeftSidebarFooter";

const LeftSidebar = () => {
  return (
    <Sidebar
      variant="sidebar"
      defaultSize="16rem"
      minSize="15rem"
      maxSize="36rem"
      innerClassName="bg-sidebar border-r border-white/[0.08] flex flex-col h-full"
    >
      <LeftSidebarHeader />
      <LeftSidebarContent />
      <LeftSidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
};

export default LeftSidebar;
