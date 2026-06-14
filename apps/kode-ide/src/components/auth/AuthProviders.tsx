import { ClerkProvider } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import type { ReactNode } from "react";

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
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "oklch(0.63 0.239 349)",
          colorBackground: "oklch(0.17 0.004 260)",
          colorInputBackground: "oklch(1 0 0 / 0.04)",
          colorInputText: "oklch(0.92 0.004 260)",
          colorText: "oklch(0.92 0.004 260)",
          colorTextSecondary: "oklch(0.67 0.004 260)",
          borderRadius: "0.75rem",
        },
        elements: {
          cardBox: "shadow-none",
          card: "border border-white/[0.08] bg-[var(--surface-1)] shadow-none",
          footer: "bg-transparent",
          headerTitle: "text-foreground",
          headerSubtitle: "text-foreground/60",
          socialButtonsBlockButton:
            "border-white/[0.08] bg-white/[0.04] text-foreground hover:bg-white/[0.07]",
          formButtonPrimary:
            "bg-[var(--brand)] text-primary-foreground hover:bg-[var(--brand)]/90",
          formFieldInput:
            "border-white/[0.08] bg-white/[0.04] text-foreground",
        },
      }}
    >
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}

function MissingAuthConfig() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="glass-strong max-w-lg rounded-2xl p-6">
        <h1 className="text-xl font-semibold">Auth is not configured</h1>
        <p className="mt-3 text-foreground/62 text-sm leading-6">
          Add <code>VITE_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code>VITE_CONVEX_URL</code> to the kode-ide environment before
          starting the desktop app.
        </p>
      </div>
    </main>
  );
}
