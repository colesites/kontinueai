import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import LeftSidebarHeader from "./LeftSidebarHeader";
import LeftSidebarContent from "./LeftSidebarContent";

const LeftSidebar = () => {
  return (
    <Sidebar
      variant="floating"
      defaultSize="16rem"
      minSize="15rem"
      maxSize="40rem"
      innerClassName="glass-strong rounded-2xl pt-14"
    >
      <LeftSidebarHeader />
      <LeftSidebarContent />
      <SidebarRail />
    </Sidebar>
  );
};

export default LeftSidebar;
