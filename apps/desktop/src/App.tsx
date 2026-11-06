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
import { KodeWorkspaceProvider, useKodeWorkspace } from "@/lib/kode-workspace";
import { KodeAgentRuntimeProvider } from "@/lib/kode-agent-runtime";
import { SettingsView } from "@/components/settings/SettingsView";

function removeSplash() {
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 350);
  }
}

function WorkspaceContent() {
  const { isLoaded } = useAuth();
  const { isSettingsOpen, settingsTab, closeSettings, openSettings } = useKodeWorkspace();
  const [panelOpen, setPanelOpen] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Global shortcut to toggle settings (⌘,)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘J toggles the right workspace panel.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setPanelOpen((open) => !open);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        if (isSettingsOpen) {
          closeSettings();
        } else {
          openSettings();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen, closeSettings, openSettings]);

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

  if (!isLoaded) {
    if (!timedOut) return null;

    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <section className="max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-lg font-semibold">Sign-in could not initialize</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Clerk did not initialize in the desktop webview. Add{" "}
            <code>tauri://localhost</code> to the production Clerk instance&apos;s{" "}
            <code>allowed_origins</code> using the Clerk Backend API; there is no
            dashboard field for this. Preserve any existing origins when updating
            the list, then retry. Desktop development uses{" "}
            <code>http://localhost:1420</code>.
          </p>
          <button
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
            type="button"
          >
            Retry startup
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      {isSettingsOpen && (
        <SettingsView onBack={closeSettings} initialTab={settingsTab} />
      )}
      <SignedOut>
        <div className="relative flex h-screen w-full flex-col liquid-backdrop text-foreground overflow-hidden">

          <div className="relative flex flex-1 w-full overflow-hidden z-10">
            <SidebarProvider>
              <LeftSidebar />
              <main className="flex min-w-0 flex-1 justify-center overflow-hidden">
                <ViewLayout panelOpen={panelOpen} onPanelChange={setPanelOpen} />
              </main>
            </SidebarProvider>
          </div>
          <AuthScreen />
        </div>
      </SignedOut>
      <SignedIn>
        <UserSync />
        <SidebarProvider>
          <div className="relative flex h-screen w-full liquid-backdrop text-foreground overflow-hidden">

            <div className="relative flex flex-1 w-full overflow-hidden z-10">
              <LeftSidebar />
              <main className="flex min-w-0 flex-1 justify-center overflow-hidden">
                <ViewLayout panelOpen={panelOpen} onPanelChange={setPanelOpen} />
              </main>
            </div>
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
