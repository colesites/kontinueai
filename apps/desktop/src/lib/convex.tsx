import { useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth } from "convex/react";
import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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

// Coming back after a long time offline. While offline, Convex's token
// refresh fails, so it drops the sign-in and never asks again; Clerk still
// says you're signed in, so nothing told Convex to retry and every query ran
// signed out. Bumping this nonce builds a new token fetcher, which makes the
// provider authenticate again (convex/react ConvexProviderWithAuth). Same
// Clerk adapter as convex/react-clerk, plus that nonce.
let authNonce = 0;
const nonceListeners = new Set<() => void>();
function retryConvexAuth() {
  authNonce += 1;
  for (const listener of nonceListeners) listener();
}
const subscribeNonce = (listener: () => void) => {
  nonceListeners.add(listener);
  return () => nonceListeners.delete(listener);
};

function useAuthFromClerk() {
  const { isLoaded, isSignedIn, getToken, orgId, orgRole, sessionClaims } = useAuth();
  const nonce = useSyncExternalStore(subscribeNonce, () => authNonce);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return sessionClaims?.aud === "convex"
          ? await getToken({ skipCache: forceRefreshToken })
          : await getToken({ template: "convex", skipCache: forceRefreshToken });
      } catch {
        return null;
      }
    },
    // A new fetcher re-runs setAuth: on org change, and when recovering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgRole, nonce],
  );
  return useMemo(
    () => ({ isLoading: !isLoaded, isAuthenticated: isSignedIn ?? false, fetchAccessToken }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}

const AUTH_RETRY_MS = 10_000;
const MIN_RETRY_GAP_MS = 4_000;

/** Signed in to Clerk but not to Convex: retry when online, on focus, and every few seconds. */
function ConvexAuthRecovery() {
  const { isSignedIn } = useAuth();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const lost = Boolean(isSignedIn) && !isLoading && !isAuthenticated;
  const lastTry = useRef(0);
  useEffect(() => {
    if (!lost) return;
    const retry = () => {
      // Each try flips the provider to "loading" and back, so space them out.
      if (!navigator.onLine || Date.now() - lastTry.current < MIN_RETRY_GAP_MS) return;
      lastTry.current = Date.now();
      retryConvexAuth();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    retry();
    const timer = window.setInterval(retry, AUTH_RETRY_MS);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [lost]);
  return null;
}

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!convex) return <>{children}</>;

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromClerk}>
      <ConvexAuthRecovery />
      <AuthAwareBoundary>{children}</AuthAwareBoundary>
    </ConvexProviderWithAuth>
  );
}

export { convex };
