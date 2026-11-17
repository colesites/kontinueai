import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnedChat, requireUser } from "./kode";

// Continuity data the Kode desktop app used to keep only in localStorage:
// which local agent session continues each chat, and prompts scheduled to
// send later. The desktop keeps working from its local copy (offline too) and
// mirrors it here, so a reinstall or a second computer doesn't lose it.

const MAX_LISTED = 500;

// ─── Agent sessions ──────────────────────────────────────────────────────────

export const saveCliSession = mutation({
	args: {
		chatId: v.id("kodeChats"),
		instanceId: v.string(),
		sessionId: v.string(),
		device: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);
		const existing = await ctx.db
			.query("kodeCliSessions")
			.withIndex("by_chatId_and_instanceId", (q) =>
				q.eq("chatId", args.chatId).eq("instanceId", args.instanceId),
			)
			.unique();
		const fields = {
			sessionId: args.sessionId,
			device: args.device,
			updatedAt: Date.now(),
		};
		if (existing) await ctx.db.patch(existing._id, fields);
		else
			await ctx.db.insert("kodeCliSessions", {
				ownerId: user._id,
				chatId: args.chatId,
				instanceId: args.instanceId,
				...fields,
			});
		return null;
	},
});

export const listCliSessions = query({
	args: {},
	returns: v.array(
		v.object({
			chatId: v.id("kodeChats"),
			instanceId: v.string(),
			sessionId: v.string(),
			device: v.string(),
			updatedAt: v.number(),
		}),
	),
	handler: async (ctx) => {
		const user = await requireUser(ctx);
		const rows = await ctx.db
			.query("kodeCliSessions")
			.withIndex("by_ownerId_and_updatedAt", (q) => q.eq("ownerId", user._id))
			.order("desc")
			.take(MAX_LISTED);
		return rows.map(({ chatId, instanceId, sessionId, device, updatedAt }) => ({
			chatId,
			instanceId,
			sessionId,
			device,
			updatedAt,
		}));
	},
});

// ─── Scheduled prompts ───────────────────────────────────────────────────────

const scheduledFields = {
	localId: v.string(),
	chatId: v.id("kodeChats"),
	chatTitle: v.optional(v.string()),
	text: v.string(),
	modelId: v.string(),
	mode: v.string(),
	reason: v.string(),
	fireAt: v.number(),
	createdAt: v.number(),
};

export const upsertScheduledPrompt = mutation({
	args: scheduledFields,
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireOwnedChat(ctx, args.chatId, user._id);
		const existing = await ctx.db
			.query("kodeScheduledPrompts")
			.withIndex("by_ownerId_and_localId", (q) =>
				q.eq("ownerId", user._id).eq("localId", args.localId),
			)
			.unique();
		if (existing) await ctx.db.patch(existing._id, args);
		else await ctx.db.insert("kodeScheduledPrompts", { ownerId: user._id, ...args });
		return null;
	},
});

export const removeScheduledPrompt = mutation({
	args: { localId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const existing = await ctx.db
			.query("kodeScheduledPrompts")
			.withIndex("by_ownerId_and_localId", (q) =>
				q.eq("ownerId", user._id).eq("localId", args.localId),
			)
			.unique();
		if (existing) await ctx.db.delete(existing._id);
		return null;
	},
});

/**
 * Take a due prompt for this device before sending it. "claimed": send it.
 * "taken": another device already did. "missing": it was never mirrored here
 * (or was cancelled), so the caller decides from its own records.
 */
export const claimScheduledPrompt = mutation({
	args: { localId: v.string(), device: v.string() },
	returns: v.union(v.literal("claimed"), v.literal("taken"), v.literal("missing")),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const existing = await ctx.db
			.query("kodeScheduledPrompts")
			.withIndex("by_ownerId_and_localId", (q) =>
				q.eq("ownerId", user._id).eq("localId", args.localId),
			)
			.unique();
		if (!existing) return "missing";
		if (existing.claimedBy && existing.claimedBy !== args.device) return "taken";
		await ctx.db.patch(existing._id, { claimedBy: args.device, claimedAt: Date.now() });
		return "claimed";
	},
});

/** Prompts not yet taken by any device, soonest first. */
export const listScheduledPrompts = query({
	args: {},
	returns: v.array(
		v.object({
			...scheduledFields,
		}),
	),
	handler: async (ctx) => {
		const user = await requireUser(ctx);
		const rows = await ctx.db
			.query("kodeScheduledPrompts")
			.withIndex("by_ownerId_and_fireAt", (q) => q.eq("ownerId", user._id))
			.take(MAX_LISTED);
		return rows
			.filter((row) => !row.claimedBy)
			.map(({ localId, chatId, chatTitle, text, modelId, mode, reason, fireAt, createdAt }) => ({
				localId,
				chatId,
				chatTitle,
				text,
				modelId,
				mode,
				reason,
				fireAt,
				createdAt,
			}));
	},
});
