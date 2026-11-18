"use client";

import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Redeems the one-time ticket minted by /api/connectors/mobile-handoff in the
// Expo app's in-app browser, then hands off to the regular OAuth start route.
export function MobileConnectHandoff() {
	const params = useSearchParams();
	const { isLoaded, userId } = useAuth();
	const { signOut } = useClerk();
	const { signIn } = useSignIn();
	const [error, setError] = useState<string | null>(null);
	const started = useRef(false);

	const provider = params.get("provider") ?? "";
	const ticket = params.get("ticket") ?? "";
	const expectedUserId = params.get("uid") ?? "";
	const returnTo = params.get("return_to");

	useEffect(() => {
		if (!isLoaded || started.current) return;
		started.current = true;

		const startUrl = new URL(
			`/api/connectors/${encodeURIComponent(provider)}/start`,
			window.location.origin,
		);
		if (returnTo?.startsWith("mobileapp://")) {
			startUrl.searchParams.set("return_to", returnTo);
		}

		void (async () => {
			if (!provider || !ticket) {
				setError("This connection link is incomplete. Try again from the app.");
				return;
			}
			// Already signed in as the right person: no ticket needed.
			if (userId && userId === expectedUserId) {
				window.location.replace(startUrl.toString());
				return;
			}
			// Signed in as someone else: never attach the connector to them.
			if (userId) await signOut();

			const { error: ticketError } = await signIn.ticket({ ticket });
			if (ticketError || signIn.status !== "complete") {
				setError("This link has expired. Go back to the app and try again.");
				return;
			}
			const { error: finalizeError } = await signIn.finalize();
			if (finalizeError) {
				setError("We couldn't finish signing you in. Try again from the app.");
				return;
			}
			window.location.replace(startUrl.toString());
		})();
	}, [
		expectedUserId,
		isLoaded,
		provider,
		returnTo,
		signIn,
		signOut,
		ticket,
		userId,
	]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
			<div className="max-w-sm">
				{error ? (
					<>
						<p className="eyebrow">Connectors</p>
						<h1 className="mt-3 text-xl font-semibold tracking-tight">
							Connection paused
						</h1>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							{error}
						</p>
					</>
				) : (
					<>
						<Loader2 className="mx-auto size-6 animate-spin text-primary" />
						<p className="mt-4 text-sm text-muted-foreground">
							Connecting your account…
						</p>
					</>
				)}
			</div>
		</div>
	);
}
