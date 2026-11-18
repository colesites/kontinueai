import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOAuthProvider } from "../lib/oauth-providers";

// The OAuth start/callback routes read the browser's Clerk cookie session, but
// the Expo app's in-app browser usually has none. The app (Bearer-authenticated
// here) gets a one-time, two-minute sign-in ticket instead; /connect/mobile
// redeems it in that browser, then continues to the normal start route. Same
// pattern as the desktop app's /api/desktop-auth/ticket.
const TICKET_TTL_SECONDS = 2 * 60;

function appOrigin(req: Request): string {
	return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

export async function POST(request: Request) {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Not signed in" }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as {
		provider?: unknown;
		returnTo?: unknown;
	} | null;
	const provider = typeof body?.provider === "string" ? body.provider : "";
	if (!getOAuthProvider(provider)) {
		return NextResponse.json({ error: "Unknown connector." }, { status: 404 });
	}
	// Only the app scheme may be a return target (never an arbitrary URL).
	const returnTo =
		typeof body?.returnTo === "string" &&
		body.returnTo.startsWith("mobileapp://")
			? body.returnTo
			: null;

	try {
		const client = await clerkClient();
		const { token } = await client.signInTokens.createSignInToken({
			userId,
			expiresInSeconds: TICKET_TTL_SECONDS,
		});
		const url = new URL("/connect/mobile", appOrigin(request));
		url.searchParams.set("provider", provider);
		url.searchParams.set("ticket", token);
		url.searchParams.set("uid", userId);
		if (returnTo) url.searchParams.set("return_to", returnTo);
		return NextResponse.json(
			{ url: url.toString() },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		console.error("[connectors] failed to create mobile handoff ticket", error);
		return NextResponse.json(
			{ error: "Could not start the connection. Please try again." },
			{ status: 500 },
		);
	}
}
