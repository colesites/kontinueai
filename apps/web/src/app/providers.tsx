"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { QueryProvider } from "@repo/core/query-provider";
import { TooltipProvider } from "@repo/ui/components/ui/tooltip";
import { useClerkTheme } from "../components/ClerkThemeProvider";
import { ThemeInit } from "../components/ThemeInit";
import { ThemeOnboarding } from "../components/ThemeOnboarding";
import { CanvasProvider } from "../features/canvas/contexts/CanvasContext";
import { ConvexClientProvider } from "../lib/convex";

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
