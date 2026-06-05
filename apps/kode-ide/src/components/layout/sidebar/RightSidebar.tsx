import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar";
import type { AppTab } from "@/components/layout/view-layout";
import DesignSidebar from "./DesignSidebar";
import CodeSidebar from "./CodeSidebar";
import ReviewSidebar from "./ReviewSidebar";
import { useEffect } from "react";

type RightSidebarProps = {
  activeTab: AppTab;
};

const RightSidebar = ({ activeTab }: RightSidebarProps) => {
  const { setOpenForId } = useSidebar();

  useEffect(() => {
    if (activeTab !== "plan") {
      setOpenForId("right-panel", true);
    }
  }, [activeTab, setOpenForId]);

  if (activeTab === "plan") {
    return null;
  }

  const contentByTab = {
    design: <DesignSidebar />,
    code: <CodeSidebar />,
    review: <ReviewSidebar />,
  } as const;

  return (
    <Sidebar
      side="right"
      sidebarId="right-panel"
      variant="floating"
      defaultSize="20rem"
      maxSize="50rem"
      minSize="10rem"
      innerClassName="glass-strong rounded-2xl pt-4"
    >
      {contentByTab[activeTab]}
      <SidebarRail />
    </Sidebar>
  );
};

export default RightSidebar;
