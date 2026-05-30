"use client";

import React from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { useAuth } from "@clerk/nextjs";

// Only create client if URL is available (not during static build)
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// Convex surfaces query errors by throwing inside the component that called
// useQuery. During sign-out the Clerk token drops while authed queries are still
// subscribed, so they momentarily error ("Not authenticated") and — with no
// boundary — crash the whole app. This boundary catches that, and auto-resets
// whenever the auth identity changes (i.e. once sign-out/sign-in settles), so
// the app recovers without a white screen.
class AuthTransitionBoundary extends React.Component<
  { resetKey: string | null | undefined; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Keep a breadcrumb but don't treat the transient auth error as fatal.
    console.warn("[convex] query error caught at boundary", error);
  }

  componentDidUpdate(prev: { resetKey: string | null | undefined }) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function AuthAwareBoundary({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  // Reset key flips on every auth identity change (sign-in, sign-out), which
  // clears any error captured during the transition.
  return (
    <AuthTransitionBoundary resetKey={`${userId ?? "anon"}:${isSignedIn}`}>
      {children}
    </AuthTransitionBoundary>
  );
}

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // During build or if Convex isn't configured, just render children
  if (!convex) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <AuthAwareBoundary>{children}</AuthAwareBoundary>
    </ConvexProviderWithClerk>
  );
}

export { convex };
