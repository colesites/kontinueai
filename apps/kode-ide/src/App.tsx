import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useState } from "react";
import { AuthProviders } from "@/components/auth/AuthProviders";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserSync } from "@/components/auth/UserSync";

function App() {
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProviders>
        <SignedOut>
          <AuthScreen />
        </SignedOut>
        <SignedIn>
          <UserSync />
          <SidebarProvider>
            <div className="relative flex h-screen w-full">
              <FloatingSidebarButtonGroup />
              <LeftSidebar />

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
        </SignedIn>
      </AuthProviders>
    </ThemeProvider>
  );
}

export default App;
