import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// The Multi-model Memo audience in Resend (configured via env, not hardcoded).
const AUDIENCE_ID = process.env.RESEND_NEWSLETTER_AUDIENCE_ID;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
	if (!process.env.RESEND_API_KEY || !AUDIENCE_ID) {
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
		const resend = new Resend(process.env.RESEND_API_KEY);
		const { error } = await resend.contacts.create({
			email,
			audienceId: AUDIENCE_ID,
			unsubscribed: false,
		});

		if (error) {
			// Already-subscribed contacts are fine — treat them as success.
			if (/already|exist/i.test(error.message ?? "")) {
				return NextResponse.json({ ok: true, alreadySubscribed: true });
			}
			return NextResponse.json(
				{ ok: false, error: "Could not subscribe right now. Try again." },
				{ status: 502 },
			);
		}

		return NextResponse.json({ ok: true });
	} catch {
		return NextResponse.json(
			{ ok: false, error: "Something went wrong. Try again." },
			{ status: 500 },
		);
	}
}
