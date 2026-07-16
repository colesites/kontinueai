import "@/global.css";

import * as Sentry from "@sentry/react-native";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from "expo-router";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { LoadingScreen } from "@/components/loading-screen";
import { PushRegistrar } from "@/components/push-registrar";
import { UserSync } from "@/components/user-sync";
import { AppDrawer } from "@/components/sidebar/app-drawer";
import { SidebarProvider } from "@/components/sidebar/sidebar-context";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { ThemeOnboarding } from "@/components/theme-onboarding";
import { ConvexClientProvider } from "@/lib/convex";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Crash + error reporting. No-ops when no DSN is set or in local dev, so it
// stays quiet in Expo Go and only reports from real (preview/production)
// builds where EXPO_PUBLIC_SENTRY_DSN is provided.
Sentry.init({
  dsn: sentryDsn,
  enabled: !__DEV__ && !!sentryDsn,
  environment:
    process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? "development" : "production"),
  tracesSampleRate: 0.1,
});

function RootLayout() {
  if (!publishableKey) {
    throw new Error(
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from this build.",
    );
  }

  return (
    <AppErrorBoundary>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ConvexClientProvider>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </ConvexClientProvider>
      </ClerkProvider>
    </AppErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);

function AppShell() {
  const { isDark } = useTheme();
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const isAppReady = !!isSignedIn && !isConvexLoading && isConvexAuthenticated;
  const [stalledSessionId, setStalledSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || isAppReady) return;
    const timer = setTimeout(
      () => setStalledSessionId(sessionId ?? "signed-in"),
      12_000,
    );
    return () => clearTimeout(timer);
  }, [isAppReady, isLoaded, isSignedIn, sessionId]);

  const isBootstrapStalled =
    !!isSignedIn &&
    !isAppReady &&
    stalledSessionId === (sessionId ?? "signed-in");

  // Until Clerk has hydrated from the token cache, isSignedIn is undefined.
  // Show the loader instead of flashing the sign-in screen.
  if (!isLoaded || (isSignedIn && !isAppReady)) {
    return (
      <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <LoadingScreen
          stalled={isBootstrapStalled}
          onRecover={() => void signOut()}
        />
      </NavThemeProvider>
    );
  }

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <SidebarProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        >
          <Stack.Protected guard={isAppReady}>
            <Stack.Screen name="index" />
            <Stack.Screen name="tasks" />
            <Stack.Screen name="agents" />
            <Stack.Screen name="canvas" />
            <Stack.Screen name="kode" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="connectors" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="feedback" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="project/[id]" />
          </Stack.Protected>

          <Stack.Protected guard={!isAppReady}>
            <Stack.Screen name="(auth)/sign-in" />
            <Stack.Screen name="(auth)/sign-up" />
            <Stack.Screen name="(auth)/forgot-password" />
          </Stack.Protected>
        </Stack>

        {/* Drawer + first-visit theme picker only matter once authenticated. */}
        {isAppReady ? <UserSync /> : null}
        {isAppReady ? <PushRegistrar /> : null}
        {isAppReady ? <AppDrawer /> : null}
        {isAppReady ? <ThemeOnboarding /> : null}
      </SidebarProvider>
    </NavThemeProvider>
  );
}
