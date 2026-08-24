import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { ensureDocsIndexed } from "@/lib/kode-docs";
import { AuthProviders } from "@/components/auth/AuthProviders";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserSync } from "@/components/auth/UserSync";
import { KodeWorkspaceProvider } from "@/lib/kode-workspace";
import { KodeAgentRuntimeProvider } from "@/lib/kode-agent-runtime";

function removeSplash() {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 350);
  }
}

function WorkspaceContent() {
  const { isLoaded } = useAuth();
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Safety fallback: if Clerk auth initialization takes > 5s (offline, slow connection, etc.),
    // forcibly dismiss the splash screen so the app is accessible.
    const timer = setTimeout(() => {
      setTimedOut(true);
      removeSplash();
    }, 5000);

    if (isLoaded) {
      removeSplash();
      clearTimeout(timer);
    }

    return () => clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded && !timedOut) {
    return null;
  }

  return (
    <>
      <SignedOut>
        <div className="relative flex h-screen w-full bg-background overflow-hidden">
          <SidebarProvider>
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
          <div className="relative flex h-screen w-full bg-background overflow-hidden">
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
    </>
  );
}

function App() {
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
            <WorkspaceContent />
          </KodeAgentRuntimeProvider>
        </KodeWorkspaceProvider>
      </AuthProviders>
    </ThemeProvider>
  );
}

export default App;

