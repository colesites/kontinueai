import { ClerkProvider } from "@clerk/clerk-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { ConvexClientProvider } from "@/lib/convex";
import { getDesktopClerk } from "@/lib/desktop-clerk";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;

// `tauri dev` is a normal browser at http://localhost:1420, so it must not send
// Clerk's native Authorization header (the webview already sets Origin).
// The packaged app stays on the no-cookie client JWT path.
const nativeClerk = !import.meta.env.DEV;

export function AuthProviders({ children }: { children: ReactNode }) {
  if (!publishableKey || !convexUrl) {
    return <MissingAuthConfig />;
  }

  return (
    <ClerkProvider
      {...(nativeClerk
        ? {
            Clerk: getDesktopClerk(publishableKey),
            standardBrowser: false as const,
          }
        : {})}
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      allowedRedirectProtocols={["tauri:", "kontinueai:"]}
    >
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}

function MissingAuthConfig() {
  useEffect(() => {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 350);
    }
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="glass-strong max-w-lg rounded-2xl p-6">
        <h1 className="text-xl font-semibold">Auth is not configured</h1>
        <p className="mt-3 text-foreground/62 text-sm leading-6">
          Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> and <code>VITE_CONVEX_URL</code> to the Kontinue AI Desktop environment before starting the desktop app.
        </p>
      </div>
    </main>
  );
}
