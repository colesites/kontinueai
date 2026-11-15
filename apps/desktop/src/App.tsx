import { useAuth } from "@clerk/clerk-react";
import { useConvexAuth, useConvexConnectionState, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useStableUserId } from "@/hooks/use-stable-user-id";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ViewLayout from "@/components/layout/view-layout";
import LeftSidebar from "@/components/layout/sidebar/LeftSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProviders } from "@/components/auth/AuthProviders";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { useUserSync } from "@/components/auth/UserSync";
import { useResolvedPlanTier } from "@/hooks/use-plan-tier";
import { api } from "@/lib/convex-api";
import { isAccountStartupReady } from "@/lib/startup-readiness";
import { KodeWorkspaceProvider, useKodeWorkspace } from "@/lib/kode-workspace";
import { useKeybinding } from "@/lib/kode-keybindings";
import { KodeAgentRuntimeProvider } from "@/lib/kode-agent-runtime";
import { SettingsView } from "@/components/settings/SettingsView";
import { ViewErrorBoundary } from "@/components/layout/ViewErrorBoundary";
import { TitleTooltips } from "@/components/ui/title-tooltips";

const STARTUP_TIMEOUT_MS = 15_000;

function removeSplash() {
  const splash = document.getElementById("splash");
  if (splash && !splash.classList.contains("hide")) {
    splash.classList.add("hide");
    setTimeout(() => splash.remove(), 350);
  }
}

function StartupFailure({ signIn }: { signIn?: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section role="alert" className="max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h1 className="text-lg font-semibold">
          {signIn ? "Couldn't connect to sign-in" : "Couldn't load your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check your internet connection and try again. If the problem persists, contact support@kontinueai.com.
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

function StartupLoading() {
  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#0a0a0a] text-white" role="status">
      <img src="/kontinueai.svg" alt="Kontinue AI" className="w-[168px] brightness-0 invert" />
      <span className="text-sm text-white/60">Loading your account…</span>
    </main>
  );
}

/** Keep the startup screen up until the saved account, sync, and usage plan agree. */
function SignedInStartup() {
  const { isAuthenticated } = useConvexAuth();
  const { isWebSocketConnected } = useConvexConnectionState();
  const plan = useResolvedPlanTier();
  // Never write a cached or transiently unauthenticated tier back to billing.
  const { synced, failed } = useUserSync(isWebSocketConnected ? plan : null);
  const usage = useQuery(api.kodeUsage.getUsage, isAuthenticated ? {} : "skip");
  const ready = isAccountStartupReady({
    isConvexAuthenticated: isAuthenticated,
    plan,
    usagePlan: usage?.plan,
    synced,
  });
  const [opened, setOpened] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (ready) {
      setOpened(true);
      removeSplash();
    }
  }, [ready]);

  useEffect(() => {
    if (opened) return;
    const timer = setTimeout(() => setTimedOut(true), STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [opened]);

  const showFailure = !opened && !ready && (timedOut || failed);
  useEffect(() => {
    if (showFailure) removeSplash();
  }, [showFailure]);

  if (showFailure) return <StartupFailure />;
  if (!opened && !ready) return <StartupLoading />;
  return <WorkspaceContent signedIn />;
}

function WorkspaceContent({ signedIn }: { signedIn: boolean }) {
  const { isSettingsOpen, settingsTab, closeSettings, openSettings } = useKodeWorkspace();
  const [panelOpen, setPanelOpen] = useState(false);

  useKeybinding("app.settings", () => {
    if (isSettingsOpen) closeSettings();
    else openSettings();
  });

  return (
    <>
      {isSettingsOpen && (
        <ViewErrorBoundary name="settings" resetKey={String(settingsTab ?? "")}>
          <SettingsView onBack={closeSettings} initialTab={settingsTab} />
        </ViewErrorBoundary>
      )}
      <SidebarProvider>
        <div className="relative flex h-screen w-full flex-col liquid-backdrop text-foreground overflow-hidden">
          <div className="relative flex flex-1 w-full overflow-hidden z-10">
            <LeftSidebar />
            <main className="flex min-w-0 flex-1 justify-center overflow-hidden">
              <ViewLayout panelOpen={panelOpen} onPanelChange={setPanelOpen} />
            </main>
          </div>
          {!signedIn && <AuthScreen />}
        </div>
      </SidebarProvider>
    </>
  );
}

function StartupGate() {
  const { isLoaded, isSignedIn } = useAuth();
  // Do not unmount the workspace during an auth refresh.
  const currentUser = useStableUserId();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setTimedOut(true), STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    if ((isLoaded && !isSignedIn) || (!isLoaded && timedOut)) removeSplash();
  }, [isLoaded, isSignedIn, timedOut]);

  if (currentUser) return <SignedInStartup key={currentUser} />;
  if (!isLoaded) return timedOut ? <StartupFailure signIn /> : <StartupLoading />;
  return <WorkspaceContent signedIn={false} />;
}

function MainApp() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProviders>
        <KodeWorkspaceProvider>
          <KodeAgentRuntimeProvider>
            <StartupGate />
            <TitleTooltips />
          </KodeAgentRuntimeProvider>
        </KodeWorkspaceProvider>
      </AuthProviders>
    </ThemeProvider>
  );
}

export default function App() {
  return <MainApp />;
}
