import { CREDIT_PACKS, creditPackMicros } from "@repo/ai/lib/kode-usage";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import type Stripe from "stripe";
import { getStripe } from "../../lib/stripe";

// Stripe webhook: adds Kode usage credits when a credit-pack checkout is paid.
// Signature-verified; the Convex grant is idempotent per checkout session.

export async function POST(request: Request) {
	const stripe = getStripe();
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
	const serverSecret = process.env.KODE_SERVER_SECRET;
	if (!stripe || !webhookSecret || !serverSecret) {
		return new Response("Billing is not configured", { status: 503 });
	}

	const signature = request.headers.get("stripe-signature");
	if (!signature) return new Response("Missing signature", { status: 400 });

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
	} catch (error) {
		console.error("[stripe/webhook] bad signature", error);
		return new Response("Invalid signature", { status: 400 });
	}

	if (
		event.type === "checkout.session.completed" ||
		event.type === "checkout.session.async_payment_succeeded"
	) {
		const session = event.data.object as Stripe.Checkout.Session;
		const pack = CREDIT_PACKS.find((item) => item.id === session.metadata?.packId);
		const clerkUserId = session.metadata?.clerkUserId ?? session.client_reference_id;
		if (session.payment_status === "paid" && pack && clerkUserId) {
			try {
				await fetchMutation(convexApi.kodeUsage.grantCreditsFromPayment, {
					secret: serverSecret,
					clerkUserId,
					paymentId: session.id,
					micros: creditPackMicros(pack),
					amountCents: session.amount_total ?? pack.priceCents,
				});
			} catch (error) {
				console.error("[stripe/webhook] grant failed", error);
				// Non-2xx makes Stripe retry; the grant is idempotent.
				return new Response("Grant failed", { status: 500 });
			}
		}
	}

	return new Response("ok");
}
