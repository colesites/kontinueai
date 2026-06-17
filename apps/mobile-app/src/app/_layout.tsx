import "@/global.css";

import * as Sentry from "@sentry/react-native";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useConvexAuth } from "convex/react";

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

// Crash + error reporting. No-ops when no DSN is set or in local dev, so it
// stays quiet in Expo Go and only reports from real (preview/production)
// builds where EXPO_PUBLIC_SENTRY_DSN is provided.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConvexClientProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);

function AppShell() {
  const { isDark } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const isAppReady =
    !!isSignedIn && !isConvexLoading && isConvexAuthenticated;

  // Until Clerk has hydrated from the token cache, isSignedIn is undefined.
  // Show the loader instead of flashing the sign-in screen.
  if (!isLoaded || (isSignedIn && !isAppReady)) {
    return (
      <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <LoadingScreen />
      </NavThemeProvider>
    );
  }

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AppErrorBoundary>
        <SidebarProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "transparent" },
            }}
          >
            <Stack.Protected guard={!!isSignedIn}>
              <Stack.Screen name="index" />
              <Stack.Screen name="tasks" />
              <Stack.Screen name="agents" />
              <Stack.Screen name="canvas" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="connectors" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="chat/[id]" />
              <Stack.Screen name="project/[id]" />
            </Stack.Protected>

            <Stack.Protected guard={!isSignedIn}>
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
      </AppErrorBoundary>
    </NavThemeProvider>
  );
}
