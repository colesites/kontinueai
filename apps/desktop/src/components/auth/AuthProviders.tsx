import { ClerkProvider } from "@clerk/clerk-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { ConvexClientProvider } from "@/lib/convex";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = import.meta.env.VITE_CONVEX_URL;

export function AuthProviders({ children }: { children: ReactNode }) {
  if (!publishableKey || !convexUrl) {
    return <MissingAuthConfig />;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      allowedRedirectProtocols={["tauri:"]}
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
          Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code>VITE_CONVEX_URL</code> to the Kontinue AI Desktop environment before
          starting the desktop app.
        </p>
      </div>
    </main>
  );
}
