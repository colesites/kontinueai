import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useState } from "react";

function App() {
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SidebarProvider>
        <div className="relative flex h-screen w-full">
          <FloatingSidebarButtonGroup />
          <LeftSidebar />

          {/* flex-1 takes the space between the sidebars; content centers within it */}
          <main className="flex min-w-0 flex-1 justify-center overflow-hidden">
            <ViewLayout
              bottomPanelOpen={bottomPanelOpen}
              sidePanelOpen={sidePanelOpen}
              onBottomPanelChange={setBottomPanelOpen}
              onSidePanelChange={setSidePanelOpen}
            />
          </main>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}

export default App;
