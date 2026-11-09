import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
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
		const raw = await request.text();
		if (raw.length > MAX_BODY) return new Response("Payload too large", { status: 413 });
		const summary = summarizeWebhook((name) => request.headers.get(name), raw);
		// Pings and events that need no action are accepted and dropped.
		if (!summary.summary) return new Response("Ignored", { status: 202 });
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
