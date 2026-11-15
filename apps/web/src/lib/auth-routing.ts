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

/** Short-lived marker so a finished browser sign-in can still open the desktop app. */
export const DESKTOP_AUTH_RETURN_COOKIE = "kontinue_desktop_return";

/**
 * App pages can resume a desktop handoff. Sign-in, sign-up, and the handoff
 * page itself must keep running so Clerk can finish the attempt.
 */
export function shouldResumeDesktopAuth(pathname: string): boolean {
	if (pathname === "/desktop-auth" || pathname.startsWith("/desktop-auth/"))
		return false;
	if (isPublicAuthRoute(pathname)) return false;
	if (pathname.startsWith("/api") || pathname.startsWith("/_next"))
		return false;
	return true;
}

export function desktopAuthResumePath(
	cookieValue: string | undefined,
	pathname: string,
	origin: string,
): string | undefined {
	if (!cookieValue || !shouldResumeDesktopAuth(pathname)) return undefined;
	return clerkPostAuthRedirect(cookieValue, origin);
}

export function desktopSignInRedirects(returnTo: string | undefined) {
	if (!returnTo) return {};
	const redirect = encodeURIComponent(returnTo);
	return {
		forceRedirectUrl: returnTo,
		signUpForceRedirectUrl: returnTo,
		signUpUrl: `/sign-up?redirect_url=${redirect}`,
	};
}

export function desktopSignUpRedirects(returnTo: string | undefined) {
	if (!returnTo) return {};
	const redirect = encodeURIComponent(returnTo);
	return {
		forceRedirectUrl: returnTo,
		signInForceRedirectUrl: returnTo,
		signInUrl: `/sign-in?redirect_url=${redirect}`,
	};
}

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
