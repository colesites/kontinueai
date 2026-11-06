import { CREDIT_PACKS, creditPackMicros } from "@repo/ai/lib/kode-usage";
import { getAuthContext } from "../../../chat/lib/route-input";
import { jsonError } from "../../../kode/lib/gateway-stream";
import { getStripe } from "../../lib/stripe";

// Starts a Stripe Checkout session for a Kode usage credit pack. Called by the
// desktop app (Clerk Bearer token) and the web app; returns the checkout URL.
// Credits are added by the Stripe webhook once payment succeeds.

export async function POST(request: Request) {
	const { userId } = await getAuthContext();
	if (!userId) return jsonError(401, "unauthorized", "Sign in to buy credits.");

	const stripe = getStripe();
	if (!stripe) return jsonError(503, "billing_unavailable", "Buying credits isn't available yet.");

	let packId = "";
	try {
		packId = ((await request.json()) as { packId?: string }).packId ?? "";
	} catch {
		// handled below
	}
	const pack = CREDIT_PACKS.find((item) => item.id === packId);
	if (!pack) return jsonError(400, "unknown_pack", "Choose a credit pack.");

	const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
	const credit = (creditPackMicros(pack) / 1_000_000).toFixed(2);

	const session = await stripe.checkout.sessions.create({
		mode: "payment",
		client_reference_id: userId,
		metadata: { clerkUserId: userId, packId: pack.id },
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: "usd",
					unit_amount: pack.priceCents,
					product_data: {
						name: `Kontinue usage credits · $${credit}`,
						description:
							pack.bonusPercent > 0
								? `Includes a ${pack.bonusPercent}% bonus. Used after your plan limits.`
								: "Used after your plan limits.",
					},
				},
			},
		],
		success_url: `${appUrl}/settings?credits=success`,
		cancel_url: `${appUrl}/settings?credits=cancelled`,
	});

	if (!session.url) return jsonError(502, "checkout_failed", "Couldn't start checkout. Try again.");
	return Response.json({ url: session.url });
}
