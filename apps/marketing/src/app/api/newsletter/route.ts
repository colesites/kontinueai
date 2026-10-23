import { type NextRequest, NextResponse } from "next/server";

// The Multi-model Memo audience in Multivrs Mail (configured via env, not hardcoded).
const AUDIENCE_ID = process.env.MULTIVRS_NEWSLETTER_AUDIENCE_ID;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
	if (!process.env.MULTIVRS_MAIL_KEY || !AUDIENCE_ID) {
		return NextResponse.json(
			{ ok: false, error: "Newsletter is not configured yet." },
			{ status: 500 },
		);
	}

	const body = (await req.json().catch(() => null)) as {
		email?: string;
	} | null;
	const email = body?.email?.trim().toLowerCase();

	if (!email || !EMAIL_RE.test(email)) {
		return NextResponse.json(
			{ ok: false, error: "Enter a valid email address." },
			{ status: 400 },
		);
	}

	try {
		const res = await fetch("https://multivrs.space/api/mail/contacts", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.MULTIVRS_MAIL_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email,
				audienceIds: [AUDIENCE_ID],
			}),
		});

		if (!res.ok) {
			const errorText = await res.text().catch(() => "");
			console.error("[newsletter] subscribe failed:", res.status, errorText);

			// Already-subscribed contacts are fine — treat them as success.
			if (/already|exist/i.test(errorText)) {
				return NextResponse.json({ ok: true, alreadySubscribed: true });
			}
			return NextResponse.json(
				{ ok: false, error: "Could not subscribe right now. Try again." },
				{ status: 502 },
			);
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("[newsletter] unexpected error:", error);
		return NextResponse.json(
			{ ok: false, error: "Something went wrong. Try again." },
			{ status: 500 },
		);
	}
}
