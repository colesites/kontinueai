import React from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/expo";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Wires Convex to Clerk auth (mirrors apps/web/src/lib/convex.tsx). Convex
 * queries throw inside the calling component during the brief window where the
 * Clerk token drops on sign-out; this boundary swallows that transient error
 * and resets once the auth identity settles, so the app never white-screens.
 */
class AuthTransitionBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[convex] query error caught at boundary", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function AuthAwareBoundary({ children }: { children: React.ReactNode }) {
  const { sessionId, userId, isSignedIn } = useAuth();
  const resetKey = `${sessionId ?? "signed-out"}:${userId ?? "anon"}:${isSignedIn}`;

  return (
    <AuthTransitionBoundary key={resetKey}>{children}</AuthTransitionBoundary>
  );
}

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!convex) {
    throw new Error("EXPO_PUBLIC_CONVEX_URL is missing from this build.");
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <AuthAwareBoundary>{children}</AuthAwareBoundary>
    </ConvexProviderWithClerk>
  );
}
