"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@repo/convex/convex/_generated/api";
import { persistedPlanForTier } from "@repo/core/plan-tier";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { usePlanTier } from "../lib/use-plan-tier";

// Referral code captured by the /invite/[code] route, applied on first signup.
const REF_COOKIE = "kontinue_ref";

function readRefCookie(): string | undefined {
	if (typeof document === "undefined") return undefined;
	const match = document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${REF_COOKIE}=`));
	const value = match?.slice(REF_COOKIE.length + 1);
	return value ? decodeURIComponent(value) : undefined;
}

function clearRefCookie() {
	if (typeof document === "undefined") return;
	// biome-ignore lint/suspicious/noDocumentCookie: one-shot cleanup of the referral cookie after attribution; the cookieStore API lacks Safari support.
	document.cookie = `${REF_COOKIE}=; max-age=0; path=/`;
}

/**
 * A lightweight component that ensures the current Clerk user
 * is synced to the Convex database.
 */
export function UserSync() {
	const { user, isLoaded } = useUser();
	const { isLoaded: isAuthLoaded } = useAuth();
	const getOrCreateUser = useMutation(api.users.getOrCreateUser);
	const planTier = usePlanTier();

	useEffect(() => {
		if (!isLoaded || !isAuthLoaded || !user) {
			return;
		}

		const referralCode = readRefCookie();

		void getOrCreateUser({
			email: user.primaryEmailAddress?.emailAddress ?? "",
			name: user.fullName ?? undefined,
			imageUrl: user.imageUrl ?? undefined,
			subscriptionStatus: planTier === "free" ? "inactive" : "active",
			plan: persistedPlanForTier(planTier),
			...(referralCode ? { referralCode } : {}),
		})
			.then(() => {
				// Attribution only happens on the user's very first sync; clear the
				// cookie afterwards so it never re-applies on later loads.
				if (referralCode) clearRefCookie();
			})
			.catch(() => {
				// Ignore: UserSync re-runs on the next load if this sync failed.
			});
	}, [getOrCreateUser, isAuthLoaded, isLoaded, planTier, user]);

	return null;
}
