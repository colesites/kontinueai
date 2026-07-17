"use client";

import { TooltipProvider } from "@repo/ui/components/ui/tooltip";
import dynamic from "next/dynamic";
import { CanvasProvider } from "../features/canvas/contexts/CanvasContext";
import {
	ConvexClientProvider,
	PublicConvexClientProvider,
} from "../lib/convex";

const ThemeOnboarding = dynamic(
	() =>
		import("../components/ThemeOnboarding").then(
			(module) => module.ThemeOnboarding,
		),
	{ ssr: false },
);

export function ConvexProviders({ children }: { children: React.ReactNode }) {
	return (
		<ConvexClientProvider>
			<TooltipProvider>{children}</TooltipProvider>
		</ConvexClientProvider>
	);
}

export function PublicConvexProviders({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<PublicConvexClientProvider>
			<TooltipProvider>{children}</TooltipProvider>
		</PublicConvexClientProvider>
	);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
	return (
		<ConvexProviders>
			<CanvasProvider>
				<ThemeOnboarding />
				{children}
			</CanvasProvider>
		</ConvexProviders>
	);
}
