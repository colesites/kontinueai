"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexClientProvider } from "../lib/convex";
import { QueryProvider } from "@repo/core/query-provider";
import { TooltipProvider } from "@repo/ui/components/ui/tooltip";
import { ThemeOnboarding } from "../components/ThemeOnboarding";
import { ThemeInit } from "../components/ThemeInit";
import { useClerkTheme } from "../components/ClerkThemeProvider";

import { CanvasProvider } from "../features/canvas/contexts/CanvasContext";

function ClerkWrapper({ children }: { children: React.ReactNode }) {
  const clerkTheme = useClerkTheme();

  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: clerkTheme.variables,
        elements: clerkTheme.elements,
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkWrapper>
      <QueryProvider>
        <ConvexClientProvider>
          <TooltipProvider>
            <CanvasProvider>
              <ThemeInit />
              <ThemeOnboarding />
              {children}
            </CanvasProvider>
          </TooltipProvider>
        </ConvexClientProvider>
      </QueryProvider>
    </ClerkWrapper>
  );
}

