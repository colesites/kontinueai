// Webhooks that start Kode threads.
//
// Each webhook has a secret URL (https://<deployment>.convex.site/kode/hooks/<token>).
// A delivery (GitHub, GitLab or any JSON/text POST) is summarized and stored as
// a pending event; the user's desktop app claims it, opens a thread in the
// webhook's project and sends the prompt. Claiming is atomic, so only one of
// the user's devices acts on an event.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { WEBHOOK_KINDS, type WebhookKind } from "./lib/kodeWebhookSummary";

const filtersValidator = v.object({
	kinds: v.optional(v.array(v.string())),
	branches: v.optional(v.array(v.string())),
	authors: v.optional(v.array(v.string())),
});

/** Keep filters small and to known event kinds. */
function cleanFilters(filters: { kinds?: string[]; branches?: string[]; authors?: string[] }) {
	const list = (items: string[] | undefined, max: number) =>
		[...new Set((items ?? []).map((i) => i.trim().slice(0, 100)).filter(Boolean))].slice(0, max);
	return {
		kinds: list(filters.kinds, 10).filter((k): k is WebhookKind => WEBHOOK_KINDS.includes(k as WebhookKind)),
		branches: list(filters.branches, 20),
		authors: list(filters.authors, 50),
	};
}

const MAX_WEBHOOKS = 25;
const MAX_EVENTS_PER_HOUR = 60;
const MAX_PAYLOAD = 30_000;

async function currentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
}

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
	const user = await currentUser(ctx);
	if (!user) throw new Error("Not authenticated");
	return user;
}

async function ownedWebhook(ctx: MutationCtx, id: Id<"kodeWebhooks">, userId: Id<"users">) {
	const hook = await ctx.db.get(id);
	if (!hook || hook.ownerId !== userId) throw new Error("Webhook not found");
	return hook;
}

function newToken(size = 24): string {
	const bytes = new Uint8Array(size);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createWebhook = mutation({
	args: {
		name: v.string(),
		projectPath: v.optional(v.string()),
		projectName: v.optional(v.string()),
		instructions: v.optional(v.string()),
		requireSignature: v.optional(v.boolean()),
		filters: v.optional(filtersValidator),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const existing = await ctx.db
			.query("kodeWebhooks")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();
		if (existing.length >= MAX_WEBHOOKS) throw new Error(`You can have up to ${MAX_WEBHOOKS} webhooks.`);
		const token = newToken();
		const id = await ctx.db.insert("kodeWebhooks", {
			ownerId: user._id,
			name: args.name.trim().slice(0, 80) || "Webhook",
			token,
			projectPath: args.projectPath,
			projectName: args.projectName,
			instructions: args.instructions?.slice(0, 4000),
			enabled: true,
			createdAt: Date.now(),
			signingSecret: newToken(32),
			requireSignature: args.requireSignature ?? true,
			filters: args.filters ? cleanFilters(args.filters) : undefined,
		});
		return { id, token };
	},
});

export const listWebhooks = query({
	args: {},
	handler: async (ctx) => {
		const user = await currentUser(ctx);
		if (!user) return [];
		const hooks = await ctx.db
			.query("kodeWebhooks")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id))
			.collect();
		return hooks.map((hook) => ({
			id: hook._id,
			name: hook.name,
			token: hook.token,
			projectPath: hook.projectPath ?? null,
			projectName: hook.projectName ?? null,
			instructions: hook.instructions ?? null,
			enabled: hook.enabled,
			lastEventAt: hook.lastEventAt ?? null,
			signingSecret: hook.signingSecret ?? null,
			requireSignature: hook.requireSignature ?? false,
			filters: {
				kinds: hook.filters?.kinds ?? [],
				branches: hook.filters?.branches ?? [],
				authors: hook.filters?.authors ?? [],
			},
		}));
	},
});

export const updateWebhook = mutation({
	args: {
		id: v.id("kodeWebhooks"),
		enabled: v.optional(v.boolean()),
		instructions: v.optional(v.string()),
		rotateToken: v.optional(v.boolean()),
		rotateSecret: v.optional(v.boolean()),
		requireSignature: v.optional(v.boolean()),
		filters: v.optional(filtersValidator),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const hook = await ownedWebhook(ctx, args.id, user._id);
		const patch: Partial<Doc<"kodeWebhooks">> = {};
		if (args.enabled !== undefined) patch.enabled = args.enabled;
		if (args.instructions !== undefined) patch.instructions = args.instructions.slice(0, 4000);
		if (args.rotateToken) patch.token = newToken();
		// Older webhooks get a secret the first time signing is turned on.
		if (args.rotateSecret || (args.requireSignature && !hook.signingSecret)) patch.signingSecret = newToken(32);
		if (args.requireSignature !== undefined) patch.requireSignature = args.requireSignature;
		if (args.filters !== undefined) patch.filters = cleanFilters(args.filters);
		await ctx.db.patch(args.id, patch);
		return null;
	},
});

export const deleteWebhook = mutation({
	args: { id: v.id("kodeWebhooks") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await ownedWebhook(ctx, args.id, user._id);
		const events = await ctx.db
			.query("kodeWebhookEvents")
			.withIndex("by_webhook", (q) => q.eq("webhookId", args.id))
			.collect();
		for (const event of events) await ctx.db.delete(event._id);
		await ctx.db.delete(args.id);
		return null;
	},
});

/** Events no device has picked up yet (oldest first). */
export const pendingWebhookEvents = query({
	args: {},
	handler: async (ctx) => {
		const user = await currentUser(ctx);
		if (!user) return [];
		const events = await ctx.db
			.query("kodeWebhookEvents")
			.withIndex("by_owner_claimed", (q) => q.eq("ownerId", user._id).eq("claimedAt", undefined))
			.take(20);
		const out = [];
		for (const event of events) {
			const hook = await ctx.db.get(event.webhookId);
			if (!hook) continue;
			out.push({
				id: event._id,
				webhookName: hook.name,
				projectPath: hook.projectPath ?? null,
				projectName: hook.projectName ?? null,
				instructions: hook.instructions ?? null,
				source: event.source,
				event: event.event,
				summary: event.summary,
				payload: event.payload,
				createdAt: event.createdAt,
			});
		}
		return out;
	},
});

/** Claim an event for this device. False when another device got it first. */
export const claimWebhookEvent = mutation({
	args: { eventId: v.id("kodeWebhookEvents"), deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const event = await ctx.db.get(args.eventId);
		if (!event || event.ownerId !== user._id) throw new Error("Event not found");
		if (event.claimedAt !== undefined) return false;
		await ctx.db.patch(args.eventId, { claimedAt: Date.now(), claimedBy: args.deviceId.slice(0, 80) });
		return true;
	},
});

/** Called by the HTTP route before recording: signing settings and filters. */
export const webhookGate = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const hook = await ctx.db
			.query("kodeWebhooks")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.unique();
		if (!hook) return null;
		return {
			enabled: hook.enabled,
			signingSecret: hook.signingSecret ?? null,
			requireSignature: hook.requireSignature ?? false,
			filters: hook.filters
				? { kinds: (hook.filters.kinds ?? []) as WebhookKind[], branches: hook.filters.branches ?? [], authors: hook.filters.authors ?? [] }
				: null,
		};
	},
});

/** Called by the HTTP route. Returns why a delivery was dropped, or null. */
export const recordWebhookEvent = internalMutation({
	args: {
		token: v.string(),
		source: v.string(),
		event: v.string(),
		summary: v.string(),
		payload: v.string(),
	},
	handler: async (ctx, args) => {
		const hook = await ctx.db
			.query("kodeWebhooks")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.unique();
		if (!hook) return "unknown";
		if (!hook.enabled) return "disabled";
		const now = Date.now();
		const recent = await ctx.db
			.query("kodeWebhookEvents")
			.withIndex("by_webhook", (q) => q.eq("webhookId", hook._id).gt("createdAt", now - 3_600_000))
			.take(MAX_EVENTS_PER_HOUR + 1);
		if (recent.length >= MAX_EVENTS_PER_HOUR) return "rate_limited";
		await ctx.db.insert("kodeWebhookEvents", {
			webhookId: hook._id,
			ownerId: hook.ownerId,
			source: args.source.slice(0, 20),
			event: args.event.slice(0, 80),
			summary: args.summary.slice(0, 8_000),
			payload: args.payload.slice(0, MAX_PAYLOAD),
			createdAt: now,
		});
		await ctx.db.patch(hook._id, { lastEventAt: now });
		return null;
	},
});
