import { NextResponse } from "next/server";

// Public landing for referral links: https://app/invite/<code>. We stash the
// code in a readable cookie and bounce the visitor to sign-up. After they
// create an account, UserSync reads the cookie and attributes the referral.
const REF_COOKIE = "kontinue_ref";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function appOrigin(req: Request): string {
	return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ code: string }> },
) {
	const { code } = await params;
	// Match the shape ensureReferralCode emits (uppercase alphanumerics).
	const normalized = code
		.replace(/[^a-zA-Z0-9]/g, "")
		.toUpperCase()
		.slice(0, 16);

	const res = NextResponse.redirect(new URL("/sign-up", appOrigin(req)));
	if (normalized) {
		res.cookies.set(REF_COOKIE, normalized, {
			maxAge: COOKIE_MAX_AGE_SECONDS,
			path: "/",
			sameSite: "lax",
			// Read client-side by UserSync after signup, so not httpOnly.
			httpOnly: false,
			secure: process.env.NODE_ENV === "production",
		});
	}
	return res;
}
