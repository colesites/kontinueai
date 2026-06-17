/**
 * Display-name helpers shared across the app. Order of preference:
 * real name (Clerk firstName/lastName) -> username -> the part before "@"
 * in the email -> a friendly default. Keeps a consistent fallback now that
 * the Name field is optional at sign-up.
 */
type ClerkUserLike =
	| {
			fullName?: string | null;
			firstName?: string | null;
			username?: string | null;
			primaryEmailAddress?: { emailAddress?: string | null } | null;
	  }
	| null
	| undefined;

function emailLocalPart(user: ClerkUserLike): string | undefined {
	const email = user?.primaryEmailAddress?.emailAddress;
	const local = email?.split("@")[0]?.trim();
	return local || undefined;
}

export function getDisplayName(user: ClerkUserLike, fallback = "there"): string {
	return (
		user?.fullName?.trim() ||
		user?.username?.trim() ||
		emailLocalPart(user) ||
		fallback
	);
}

export function getFirstName(user: ClerkUserLike, fallback = "there"): string {
	const first = user?.firstName?.trim();
	if (first) return first;
	return getDisplayName(user, fallback).split(/\s+/)[0] ?? fallback;
}

export function getInitial(user: ClerkUserLike): string {
	return getDisplayName(user, "?")[0]?.toUpperCase() ?? "?";
}
