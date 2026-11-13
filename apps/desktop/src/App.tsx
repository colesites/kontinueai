import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { AuthProviders } from "@/components/auth/AuthProviders";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { UserSync } from "@/components/auth/UserSync";
import { KodeWorkspaceProvider, useKodeWorkspace } from "@/lib/kode-workspace";
import { useKeybinding } from "@/lib/kode-keybindings";
import { KodeAgentRuntimeProvider } from "@/lib/kode-agent-runtime";
import { SettingsView } from "@/components/settings/SettingsView";
import { ViewErrorBoundary } from "@/components/layout/ViewErrorBoundary";
import { TitleTooltips } from "@/components/ui/title-tooltips";

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

  // Global shortcuts (rebindable in Settings → Keyboard shortcuts).
  useKeybinding("app.settings", () => {
    if (isSettingsOpen) closeSettings();
    else openSettings();
  });

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
          <h1 className="text-lg font-semibold">Couldn&apos;t connect to sign-in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Kontinue AI couldn&apos;t reach its sign-in service. Check your internet
            connection and try again. If it keeps happening, tell us at
            support@kontinueai.com and include the line below.
          </p>
          {/* Clerk only loads for app addresses in the production instance's
              allowed_origins (Backend API): tauri://localhost on macOS/Linux,
              http://tauri.localhost on Windows, http://localhost:1420 in dev. */}
          <p className="mt-3 font-mono text-xs text-muted-foreground/60">{window.location.origin}</p>
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
        <ViewErrorBoundary name="settings" resetKey={String(settingsTab ?? "")}>
          <SettingsView onBack={closeSettings} initialTab={settingsTab} />
        </ViewErrorBoundary>
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

function MainApp() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProviders>
        <KodeWorkspaceProvider>
          <KodeAgentRuntimeProvider>
            <WorkspaceContent />
            <TitleTooltips />
          </KodeAgentRuntimeProvider>
        </KodeWorkspaceProvider>
      </AuthProviders>
    </ThemeProvider>
  );
}

function App() {
  return <MainApp />;
}

export default App;
