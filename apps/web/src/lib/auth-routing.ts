export const PUBLIC_AUTH_ROUTES = ["/sign-in", "/sign-up"] as const;

export const PROTECTED_APP_ROUTES = [
	"/",
	"/agents",
	"/canvas",
	"/chat/example",
	"/kode",
	"/kode/example",
	"/projects/example",
	"/settings",
	"/settings/connectors",
	"/settings/privacy-policy",
	"/settings/terms-of-service",
	"/tasks",
] as const;

export function isPublicAuthRoute(pathname: string): boolean {
	return PUBLIC_AUTH_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);
}

export function protectedAppRedirect(userId: string | null): "/sign-in" | null {
	return userId ? null : "/sign-in";
}

const DESKTOP_AUTH_STATE = /^[a-f0-9]{64}$/;

/**
 * Clerk's instance-level after-sign-in URL is `/`, which would drop the
 * desktop handoff. Only same-origin `/desktop-auth` (with a valid state)
 * is allowed through as a forced post-auth redirect.
 */
export function clerkPostAuthRedirect(
	redirectUrl: string | string[] | undefined,
	origin: string,
): string | undefined {
	const raw = Array.isArray(redirectUrl) ? redirectUrl[0] : redirectUrl;
	if (!raw || !origin) return undefined;

	let url: URL;
	try {
		url = raw.startsWith("/") ? new URL(raw, origin) : new URL(raw);
	} catch {
		return undefined;
	}

	let allowedOrigin: URL;
	try {
		allowedOrigin = new URL(origin);
	} catch {
		return undefined;
	}
	if (url.origin !== allowedOrigin.origin) return undefined;
	if (url.pathname !== "/desktop-auth") return undefined;
	if (!DESKTOP_AUTH_STATE.test(url.searchParams.get("state") ?? "")) {
		return undefined;
	}

	return `${url.pathname}${url.search}`;
}
