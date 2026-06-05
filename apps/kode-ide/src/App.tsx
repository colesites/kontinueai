import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import type { AppTab } from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import RightSidebar from "@/components/layout/sidebar/RightSidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TabProvider } from "@/components/layout/tab-context";
import { useState } from "react";

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("plan");
  const showRightSidebar = activeTab !== "plan";

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TabProvider value={{ activeTab, setActiveTab }}>
      <SidebarProvider>
        <div className="relative flex h-screen w-full">
          <FloatingSidebarButtonGroup />
          <LeftSidebar />

          {/* flex-1 takes the space between the sidebars; content centers within it */}
          <main className="flex min-w-0 flex-1 justify-center overflow-hidden">
            <ViewLayout activeTab={activeTab} onTabChange={setActiveTab} />
          </main>

          {showRightSidebar ? <RightSidebar activeTab={activeTab} /> : null}
        </div>
      </SidebarProvider>
      </TabProvider>
    </ThemeProvider>
  );
}

export default App;
