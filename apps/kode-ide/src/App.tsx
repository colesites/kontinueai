import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import FloatingSidebarButtonGroup from "@/components/layout/sidebar/FloatingSidebarButtonGroup";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { ensureDocsIndexed } from "@/lib/kode-docs";
import { AuthProviders } from "@/components/auth/AuthProviders";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserSync } from "@/components/auth/UserSync";
import { KodeWorkspaceProvider } from "@/lib/kode-workspace";
import { KodeAgentRuntimeProvider } from "@/lib/kode-agent-runtime";

function App() {
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Warm the local docs index at startup so the first chat message is grounded.
  // Persists on disk across sessions; only re-fetches stale sources.
  useEffect(() => {
    void ensureDocsIndexed();
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProviders>
        <KodeWorkspaceProvider>
          <KodeAgentRuntimeProvider>
          <SignedOut>
            <div className="relative flex h-screen w-full">
              <SidebarProvider>
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
              </SidebarProvider>
              <AuthScreen />
            </div>
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
          </KodeAgentRuntimeProvider>
        </KodeWorkspaceProvider>
      </AuthProviders>
    </ThemeProvider>
  );
}

export default App;
