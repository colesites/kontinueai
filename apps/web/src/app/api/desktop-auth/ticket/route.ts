import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Mints a short-lived, single-use Clerk sign-in token for the signed-in user so
 * the Kontinue AI desktop app can sign in as them via
 * `signIn.create({ strategy: "ticket", ticket })`.
 *
 * Called by /desktop-auth after the user signs in in their normal browser.
 */
const TICKET_TTL_SECONDS = 5 * 60;

export async function POST(request: Request) {
	// Same-origin only: the token must never be minted for a cross-site caller.
	const origin = request.headers.get("origin");
	if (origin && origin !== new URL(request.url).origin) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Not signed in" }, { status: 401 });
	}

	try {
		const client = await clerkClient();
		const { token } = await client.signInTokens.createSignInToken({
			userId,
			expiresInSeconds: TICKET_TTL_SECONDS,
		});
		return NextResponse.json(
			{ ticket: token, expiresInSeconds: TICKET_TTL_SECONDS },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (error) {
		console.error("[desktop-auth] failed to create sign-in token", error);
		return NextResponse.json(
			{ error: "Could not create a sign-in token" },
			{ status: 500 },
		);
	}
}
