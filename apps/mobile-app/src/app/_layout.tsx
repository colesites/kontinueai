import "@/global.css";

import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import * as WebBrowser from "expo-web-browser";

import { LoadingScreen } from "@/components/loading-screen";
import { AppDrawer } from "@/components/sidebar/app-drawer";
import { SidebarProvider } from "@/components/sidebar/sidebar-context";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { ThemeOnboarding } from "@/components/theme-onboarding";
import { ConvexClientProvider } from "@/lib/convex";

// Completes any pending OAuth (Google) redirect when the app regains focus.
WebBrowser.maybeCompleteAuthSession();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function RootLayout() {
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

function AppShell() {
  const { isDark } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();

  // Hold on a dark canvas (the splash overlay sits on top) until Clerk resolves,
  // so we never flash the wrong route.
  if (!isLoaded) {
    return <LoadingScreen />;
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
          <Stack.Protected guard={!!isSignedIn}>
            <Stack.Screen name="index" />
            <Stack.Screen name="tasks" />
            <Stack.Screen name="agents" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="chat/[id]" />
          </Stack.Protected>

          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="(auth)/sign-in" />
            <Stack.Screen name="(auth)/sign-up" />
          </Stack.Protected>
        </Stack>

        {/* Drawer + first-visit theme picker only matter once authenticated. */}
        {isSignedIn ? <AppDrawer /> : null}
        {isSignedIn ? <ThemeOnboarding /> : null}
      </SidebarProvider>
    </NavThemeProvider>
  );
}
