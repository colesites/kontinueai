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

export function ConvexProviders({
	children,
	requireAuthentication = false,
}: {
	children: React.ReactNode;
	requireAuthentication?: boolean;
}) {
	return (
		<ConvexClientProvider requireAuthentication={requireAuthentication}>
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
		<ConvexProviders requireAuthentication>
			<CanvasProvider>
				<ThemeOnboarding />
				{children}
			</CanvasProvider>
		</ConvexProviders>
	);
}
