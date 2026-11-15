import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import React from "react";
import { ErrorPanel } from "@/components/layout/ViewErrorBoundary";

// Strip trailing slashes — a trailing "/" produces a malformed WebSocket URL
// and the client never connects (queries hang in "loading" forever).
const convexUrl = import.meta.env.VITE_CONVEX_URL?.replace(/\/+$/, "");

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

class AuthTransitionBoundary extends React.Component<
  { resetKey: string | null | undefined; children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  state = { hasError: false, error: undefined as unknown };

  static getDerivedStateFromError(error: unknown): {
    hasError: true;
    error: unknown;
  } {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    console.error("[convex] error caught at boundary", error);
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 350);
    }
  }

  componentDidUpdate(prev: { resetKey: string | null | undefined }) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      // Last resort: views have their own boundaries, so this only shows when
      // something outside them fails.
      return (
        <div className="grid min-h-screen place-items-center bg-background text-foreground">
          <ErrorPanel error={this.state.error} onRetry={() => window.location.reload()} />
        </div>
      );
    }
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
