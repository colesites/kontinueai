import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { checkSignature, filterReason } from "./lib/kodeWebhookGuard";
import { summarizeWebhook } from "./lib/kodeWebhookSummary";

const http = httpRouter();

const MAX_BODY = 256 * 1024;

/** Kode webhooks: POST /kode/hooks/<token> starts a thread (kodeWebhooks.ts). */
http.route({
	pathPrefix: "/kode/hooks/",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const token = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
		if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });
		const bytes = new Uint8Array(await request.arrayBuffer());
		if (bytes.length > MAX_BODY) return new Response("Payload too large", { status: 413 });
		const header = (name: string) => request.headers.get(name);

		const gate = await ctx.runQuery(internal.kodeWebhooks.webhookGate, { token });
		if (!gate) return new Response("Not found", { status: 404 });
		if (!gate.enabled) return new Response("Webhook is turned off", { status: 202 });
		// The signature covers the exact bytes sent, so check before parsing.
		const signature = await checkSignature(header, bytes, gate.signingSecret);
		if (signature === "bad_signature") return new Response("Signature doesn't match", { status: 401 });
		if (signature === "unsigned" && gate.requireSignature) {
			return new Response("This webhook only accepts signed deliveries", { status: 401 });
		}

		const raw = new TextDecoder().decode(bytes);
		const summary = summarizeWebhook(header, raw);
		// Pings and events that need no action are accepted and dropped.
		if (!summary.summary) return new Response("Ignored", { status: 202 });
		const filtered = filterReason(gate.filters ?? undefined, summary);
		if (filtered) return new Response(`Filtered out (${filtered})`, { status: 202 });

		const dropped = await ctx.runMutation(internal.kodeWebhooks.recordWebhookEvent, {
			token,
			source: summary.source,
			event: summary.event,
			summary: summary.summary,
			payload: raw,
		});
		if (dropped === "unknown") return new Response("Not found", { status: 404 });
		if (dropped === "rate_limited") return new Response("Too many events", { status: 429 });
		if (dropped === "disabled") return new Response("Webhook is turned off", { status: 202 });
		return new Response("Queued", { status: 202 });
	}),
});

export default http;
