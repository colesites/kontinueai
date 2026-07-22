"use client";

import { useAuth } from "@clerk/nextjs";
import * as Sentry from "@sentry/nextjs";
import { ConvexProvider, ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import React from "react";
import { AppRouteFallback } from "../components/RouteLoadingFallbacks";

// Only create client if URL is available (not during static build)
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

class ConvexDataErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	{ error: unknown | null }
> {
	state: { error: unknown | null } = { error: null };

	static getDerivedStateFromError(error: unknown): { error: unknown } {
		return { error };
	}

	componentDidCatch(error: unknown) {
		Sentry.captureException(error);
		console.error("[convex] data error caught at boundary", error);
	}

	render() {
		if (this.state.error) {
			return (
				<div
					className="flex h-dvh items-center justify-center bg-background p-6 text-foreground"
					role="alert"
				>
					<div className="surface-card w-full max-w-md rounded-3xl p-7 text-center">
						<h1 className="text-xl font-semibold tracking-tight">
							We couldn&apos;t load your workspace
						</h1>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Your data connection was interrupted. Try again to reconnect
							without losing your work.
						</p>
						<button
							type="button"
							onClick={() => this.setState({ error: null })}
							className="glow-button mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-primary-foreground"
						>
							Try again
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

function AuthenticatedConvexGate({ children }: { children: React.ReactNode }) {
	const { isLoaded, isSignedIn, userId } = useAuth();
	const { isAuthenticated, isLoading } = useConvexAuth();

	if (!isLoaded || isLoading) return <AppRouteFallback />;

	if (!isSignedIn || !isAuthenticated) {
		return (
			<div
				className="flex h-dvh items-center justify-center bg-background p-6 text-foreground"
				role="alert"
			>
				<div className="surface-card w-full max-w-md rounded-3xl p-7 text-center">
					<h1 className="text-xl font-semibold tracking-tight">
						Your session needs to reconnect
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						Reload to securely reconnect your account and workspace.
					</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="glow-button mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-primary-foreground"
					>
						Reload
					</button>
				</div>
			</div>
		);
	}

	const authKey = `${userId}:${isAuthenticated}`;
	return (
		<ConvexDataErrorBoundary key={authKey}>{children}</ConvexDataErrorBoundary>
	);
}

export function ConvexClientProvider({
	children,
	requireAuthentication = false,
}: {
	children: React.ReactNode;
	requireAuthentication?: boolean;
}) {
	// During build or if Convex isn't configured, just render children
	if (!convex) {
		return <>{children}</>;
	}

	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			{requireAuthentication ? (
				<AuthenticatedConvexGate>{children}</AuthenticatedConvexGate>
			) : (
				<ConvexDataErrorBoundary>{children}</ConvexDataErrorBoundary>
			)}
		</ConvexProviderWithClerk>
	);
}

export function PublicConvexClientProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	if (!convex) {
		return <>{children}</>;
	}

	return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

export { convex };
