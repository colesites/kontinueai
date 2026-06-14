import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import React from "react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

class AuthTransitionBoundary extends React.Component<
  { resetKey: string | null | undefined; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
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
  if (!convex) return <>{children}</>;

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <AuthAwareBoundary>{children}</AuthAwareBoundary>
    </ConvexProviderWithClerk>
  );
}

export { convex };
