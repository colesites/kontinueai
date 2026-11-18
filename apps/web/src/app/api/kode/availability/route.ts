import { isKodeComingSoon } from "../../../../features/kode/lib/availability";

// Lets the Expo app show the same "Coming soon" screen as /kode instead of
// creating a project the build route would then refuse. Not sensitive: it only
// reports whether this deployment has Kode switched on.
export function GET(request: Request) {
	return Response.json(
		{ comingSoon: isKodeComingSoon(request.headers.get("host")) },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
