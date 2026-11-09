// Moving a Kode project to another machine. The source machine sends a
// bundle (git remote, branch, commit, uncommitted changes as a patch, and the
// project's chats). Another of the user's machines lists it, claims it once,
// and restores it into a folder (apps/desktop src-tauri/src/project_move.rs).

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const MAX_PATCH = 800_000;
const KEEP_MS = 14 * 86_400_000;

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

export const sendProjectMove = mutation({
	args: {
		name: v.string(),
		remoteUrl: v.optional(v.string()),
		branch: v.optional(v.string()),
		headSha: v.optional(v.string()),
		headPushed: v.boolean(),
		patch: v.string(),
		changedFiles: v.array(v.string()),
		chatIds: v.array(v.id("kodeChats")),
		fromDevice: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		if (args.patch.length > MAX_PATCH) throw new Error("The uncommitted changes are too large. Commit and push them first.");
		const chatIds = [];
		for (const chatId of args.chatIds.slice(0, 500)) {
			const chat = await ctx.db.get(chatId);
			if (chat && chat.ownerId === user._id) chatIds.push(chatId);
		}
		// Drop old moves so the list stays short.
		const old = await ctx.db
			.query("kodeProjectMoves")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id).lt("createdAt", Date.now() - KEEP_MS))
			.take(50);
		for (const move of old) await ctx.db.delete(move._id);
		return await ctx.db.insert("kodeProjectMoves", {
			ownerId: user._id,
			name: args.name.slice(0, 120),
			remoteUrl: args.remoteUrl?.slice(0, 500),
			branch: args.branch?.slice(0, 250),
			headSha: args.headSha?.slice(0, 64),
			headPushed: args.headPushed,
			patch: args.patch,
			changedFiles: args.changedFiles.slice(0, 2000).map((f) => f.slice(0, 500)),
			chatIds,
			fromDevice: args.fromDevice.slice(0, 80),
			createdAt: Date.now(),
		});
	},
});

/** Moves waiting to be picked up (without the patch, which can be large). */
export const listProjectMoves = query({
	args: {},
	handler: async (ctx) => {
		const user = await currentUser(ctx);
		if (!user) return [];
		const moves = await ctx.db
			.query("kodeProjectMoves")
			.withIndex("by_owner", (q) => q.eq("ownerId", user._id).gt("createdAt", Date.now() - KEEP_MS))
			.order("desc")
			.take(20);
		return moves
			.filter((move) => move.claimedAt === undefined)
			.map((move) => ({
				id: move._id,
				name: move.name,
				remoteUrl: move.remoteUrl ?? null,
				branch: move.branch ?? null,
				headPushed: move.headPushed,
				changedFiles: move.changedFiles.length,
				chats: move.chatIds.length,
				fromDevice: move.fromDevice,
				createdAt: move.createdAt,
			}));
	},
});

/** Take a move for this device: returns the full bundle once, then null. */
export const claimProjectMove = mutation({
	args: { id: v.id("kodeProjectMoves"), deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const move = await ctx.db.get(args.id);
		if (!move || move.ownerId !== user._id) throw new Error("Not found");
		if (move.claimedAt !== undefined) return null;
		await ctx.db.patch(args.id, { claimedAt: Date.now(), claimedBy: args.deviceId.slice(0, 80) });
		return {
			name: move.name,
			remoteUrl: move.remoteUrl ?? null,
			branch: move.branch ?? null,
			headSha: move.headSha ?? null,
			headPushed: move.headPushed,
			patch: move.patch,
			changedFiles: move.changedFiles,
			chatIds: move.chatIds,
		};
	},
});

/** Put a claimed move back (restore failed) or cancel one. */
export const releaseProjectMove = mutation({
	args: { id: v.id("kodeProjectMoves"), cancel: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const move = await ctx.db.get(args.id);
		if (!move || move.ownerId !== user._id) throw new Error("Not found");
		if (args.cancel) await ctx.db.delete(args.id);
		else await ctx.db.patch(args.id, { claimedAt: undefined, claimedBy: undefined });
		return null;
	},
});
