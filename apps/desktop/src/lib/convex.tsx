import { useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import React from "react";

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
      const message =
        this.state.error instanceof Error
          ? `${this.state.error.message}\n\n${this.state.error.stack ?? ""}`
          : String(this.state.error);
      return (
        <div className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
          <div className="max-w-2xl">
            <h1 className="mb-3 text-lg font-semibold">Couldn&apos;t load the app</h1>
            <pre className="overflow-auto whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
              {message}
            </pre>
            <button type="button" className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => window.location.reload()}>
              Retry startup
            </button>
          </div>
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
