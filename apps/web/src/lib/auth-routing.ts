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
