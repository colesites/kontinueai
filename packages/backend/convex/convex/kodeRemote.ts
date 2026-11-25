// Kode remote control.
//
// The desktop app (the host) runs Kode chats on the user's computer. The
// mobile and web apps (remote clients) list the user's computers, read a
// chat's live run and send commands (a prompt, an approval, an answer, Stop).
// The host subscribes to its commands, runs them and mirrors the run back.
// Both sides only hold an outbound Convex connection, so this works from
// anywhere, with no open ports on the computer.
//
// Every function derives the user from auth and only touches that user's
// devices and chats. Remote prompts are limited to the safe permission modes
// (@repo/core/kode-remote KODE_REMOTE_MODES), so every command and edit still
// asks for approval from wherever you are.

import {
	KODE_REMOTE_ACTION_TTL_MS,
	KODE_REMOTE_DEFAULT_MODE,
	KODE_REMOTE_MAX_PENDING_COMMANDS,
	KODE_REMOTE_MAX_PROMPT,
	KODE_REMOTE_SEND_TTL_MS,
	KODE_REMOTE_WATCH_MS,
	isKodeRemoteMode,
	liveTextTail,
	remoteChatTitle,
} from "@repo/core/kode-remote";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const MAX_DEVICES = 20;
const MAX_PROJECTS = 100;
const MAX_CHATS = 300;
const MAX_MODELS = 80;
const MAX_STEPS = 30;
const MAX_PENDING = 5;
const CANCELED = "Canceled.";

const runStatus = v.union(
	v.literal("running"),
	v.literal("awaiting"),
	v.literal("idle"),
);

const stepValidator = v.object({
	id: v.string(),
	name: v.string(),
	label: v.string(),
	state: v.string(),
});

const pendingValidator = v.object({
	id: v.string(),
	kind: v.union(v.literal("approval"), v.literal("question")),
	title: v.string(),
	detail: v.optional(v.string()),
	questions: v.optional(
		v.array(
			v.object({
				question: v.string(),
				kind: v.optional(v.string()),
				options: v.array(
					v.object({
						value: v.string(),
						label: v.string(),
						description: v.optional(v.string()),
					}),
				),
				allowOther: v.optional(v.boolean()),
				placeholder: v.optional(v.string()),
			}),
		),
	),
});

function fail(code: string, message: string): never {
	throw new ConvexError({ code, message });
}

const clip = (value: string, max: number) =>
	value.length > max ? value.slice(0, max) : value;

async function currentUser(
	ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) return null;
	return await ctx.db
		.query("users")
		.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", identity.subject))
		.unique();
}

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
	const user = await currentUser(ctx);
	if (!user) fail("UNAUTHORIZED", "Sign in to use remote control.");
	return user;
}

async function findDevice(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	deviceId: string,
): Promise<Doc<"kodeRemoteDevices"> | null> {
	return await ctx.db
		.query("kodeRemoteDevices")
		.withIndex("by_ownerId_and_deviceId", (q) =>
			q.eq("ownerId", ownerId).eq("deviceId", deviceId),
		)
		.unique();
}

async function requireDevice(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	deviceId: string,
): Promise<Doc<"kodeRemoteDevices">> {
	const device = await findDevice(ctx, ownerId, deviceId);
	if (!device) fail("NOT_FOUND", "That computer isn't linked to your account.");
	return device;
}

async function requireOwnedChat(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	chatId: Id<"kodeChats">,
): Promise<Doc<"kodeChats">> {
	const chat = await ctx.db.get(chatId);
	if (!chat || chat.ownerId !== ownerId) fail("NOT_FOUND", "Chat not found.");
	return chat;
}

async function presenceOf(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
	deviceId: string,
): Promise<Doc<"kodeRemotePresence"> | null> {
	return await ctx.db
		.query("kodeRemotePresence")
		.withIndex("by_ownerId_and_deviceId", (q) =>
			q.eq("ownerId", ownerId).eq("deviceId", deviceId),
		)
		.unique();
}

async function touchPresence(
	ctx: MutationCtx,
	ownerId: Id<"users">,
	deviceId: string,
	at: number,
) {
	const presence = await presenceOf(ctx, ownerId, deviceId);
	if (presence) await ctx.db.patch(presence._id, { lastSeenAt: at });
	else await ctx.db.insert("kodeRemotePresence", { ownerId, deviceId, lastSeenAt: at });
}

/** Fail every waiting command (remote control switched off, device removed). */
async function failPendingCommands(
	ctx: MutationCtx,
	ownerId: Id<"users">,
	deviceId: string,
	error: string,
) {
	const pending = await ctx.db
		.query("kodeRemoteCommands")
		.withIndex("by_ownerId_and_deviceId_and_status", (q) =>
			q.eq("ownerId", ownerId).eq("deviceId", deviceId).eq("status", "pending"),
		)
		.take(100);
	const now = Date.now();
	for (const command of pending) {
		await ctx.db.patch(command._id, { status: "failed", error, finishedAt: now });
	}
}

async function deleteRunsAndWatchers(
	ctx: MutationCtx,
	ownerId: Id<"users">,
	deviceId: string,
) {
	const runs = await ctx.db
		.query("kodeRemoteRuns")
		.withIndex("by_ownerId_and_deviceId", (q) =>
			q.eq("ownerId", ownerId).eq("deviceId", deviceId),
		)
		.take(MAX_CHATS);
	for (const run of runs) await ctx.db.delete(run._id);
	const watchers = await ctx.db
		.query("kodeRemoteWatchers")
		.withIndex("by_ownerId_and_deviceId", (q) =>
			q.eq("ownerId", ownerId).eq("deviceId", deviceId),
		)
		.take(MAX_CHATS);
	for (const watcher of watchers) await ctx.db.delete(watcher._id);
}

// ── Host (desktop app) ─────────────────────────────────────────────────────

/** The desktop app announces itself (startup, settings change). */
export const registerDevice = mutation({
	args: {
		deviceId: v.string(),
		name: v.string(),
		platform: v.string(),
		appVersion: v.optional(v.string()),
		enabled: v.boolean(),
		models: v.array(v.object({ id: v.string(), name: v.string() })),
		defaultModelId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const deviceId = clip(args.deviceId.trim(), 100);
		if (!deviceId) fail("INVALID", "Missing device id.");
		const now = Date.now();
		const fields = {
			name: clip(args.name.trim() || "My computer", 80),
			platform: clip(args.platform, 30),
			appVersion: args.appVersion ? clip(args.appVersion, 40) : undefined,
			enabled: args.enabled,
			models: args.models.slice(0, MAX_MODELS).map((model) => ({
				id: clip(model.id, 120),
				name: clip(model.name, 80),
			})),
			defaultModelId: args.defaultModelId ? clip(args.defaultModelId, 120) : undefined,
			updatedAt: now,
		};
		const existing = await findDevice(ctx, user._id, deviceId);
		if (existing) {
			await ctx.db.patch(existing._id, fields);
		} else {
			const count = (
				await ctx.db
					.query("kodeRemoteDevices")
					.withIndex("by_ownerId_and_deviceId", (q) => q.eq("ownerId", user._id))
					.take(MAX_DEVICES)
			).length;
			if (count >= MAX_DEVICES) {
				fail("LIMIT", "Too many computers are linked. Remove one from remote control first.");
			}
			await ctx.db.insert("kodeRemoteDevices", {
				ownerId: user._id,
				deviceId,
				createdAt: now,
				...fields,
			});
		}
		await touchPresence(ctx, user._id, deviceId, now);
		if (!args.enabled) {
			await failPendingCommands(ctx, user._id, deviceId, "Remote control is off on that computer.");
			await deleteRunsAndWatchers(ctx, user._id, deviceId);
		}
		return null;
	},
});

/** "Still here." Sent every KODE_REMOTE_HEARTBEAT_MS while the app is open. */
export const heartbeat = mutation({
	args: { deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireDevice(ctx, user._id, args.deviceId);
		await touchPresence(ctx, user._id, args.deviceId, Date.now());
		return null;
	},
});

/** The computer's project folders and where each chat sits (names only). */
export const syncWorkspace = mutation({
	args: {
		deviceId: v.string(),
		projects: v.array(v.object({ key: v.string(), name: v.string() })),
		chats: v.array(
			v.object({
				chatId: v.id("kodeChats"),
				projectKey: v.union(v.string(), v.null()),
			}),
		),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireDevice(ctx, user._id, args.deviceId);
		const owner = user._id;
		const deviceId = args.deviceId;

		const projects = args.projects.slice(0, MAX_PROJECTS);
		const existingProjects = await ctx.db
			.query("kodeRemoteProjects")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", owner).eq("deviceId", deviceId),
			)
			.take(MAX_PROJECTS * 2);
		const byKey = new Map(existingProjects.map((row) => [row.projectKey, row]));
		const keep = new Set<string>();
		for (const [order, project] of projects.entries()) {
			const key = clip(project.key, 100);
			const name = clip(project.name.trim() || "Project", 80);
			keep.add(key);
			const row = byKey.get(key);
			if (!row) {
				await ctx.db.insert("kodeRemoteProjects", { ownerId: owner, deviceId, projectKey: key, name, order });
			} else if (row.name !== name || row.order !== order) {
				await ctx.db.patch(row._id, { name, order });
			}
		}
		for (const row of existingProjects) {
			if (!keep.has(row.projectKey)) await ctx.db.delete(row._id);
		}

		const chats = args.chats.slice(0, MAX_CHATS);
		const existingLinks = await ctx.db
			.query("kodeRemoteChatLinks")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", owner).eq("deviceId", deviceId),
			)
			.take(MAX_CHATS * 2);
		const byChat = new Map(existingLinks.map((row) => [row.chatId, row]));
		const keepChats = new Set<Id<"kodeChats">>();
		for (const link of chats) {
			if (keepChats.has(link.chatId)) continue;
			const projectKey = link.projectKey && keep.has(link.projectKey) ? link.projectKey : null;
			const row = byChat.get(link.chatId);
			if (row) {
				keepChats.add(link.chatId);
				if (row.projectKey !== projectKey) await ctx.db.patch(row._id, { projectKey });
				continue;
			}
			const chat = await ctx.db.get(link.chatId);
			if (!chat || chat.ownerId !== owner) continue;
			keepChats.add(link.chatId);
			await ctx.db.insert("kodeRemoteChatLinks", { ownerId: owner, deviceId, chatId: link.chatId, projectKey });
		}
		for (const row of existingLinks) {
			if (!keepChats.has(row.chatId)) await ctx.db.delete(row._id);
		}
		return null;
	},
});

/** What the host should do now: waiting commands and remotely watched chats. */
export const hostState = query({
	args: { deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await currentUser(ctx);
		if (!user) return null;
		const device = await findDevice(ctx, user._id, args.deviceId);
		if (!device) return null;
		const commands = device.enabled
			? await ctx.db
					.query("kodeRemoteCommands")
					.withIndex("by_ownerId_and_deviceId_and_status", (q) =>
						q.eq("ownerId", user._id).eq("deviceId", args.deviceId).eq("status", "pending"),
					)
					.take(KODE_REMOTE_MAX_PENDING_COMMANDS)
			: [];
		const watchers = await ctx.db
			.query("kodeRemoteWatchers")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(50);
		return {
			enabled: device.enabled,
			commands: commands.map((command) => ({
				id: command._id,
				kind: command.kind,
				chatId: command.chatId,
				projectKey: command.projectKey ?? null,
				newChat: command.newChat ?? false,
				text: command.text,
				modelId: command.modelId,
				mode: command.mode,
				stepId: command.stepId,
				approved: command.approved,
				values: command.values,
				createdAt: command.createdAt,
				expiresAt: command.expiresAt,
			})),
			watchers: watchers.map((watcher) => ({ chatId: watcher.chatId, until: watcher.until })),
		};
	},
});

/** The host ran (or couldn't run) a command. */
export const completeCommand = mutation({
	args: {
		commandId: v.id("kodeRemoteCommands"),
		ok: v.boolean(),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const command = await ctx.db.get(args.commandId);
		if (!command || command.ownerId !== user._id) return false;
		if (command.status !== "pending") return false;
		await ctx.db.patch(command._id, {
			status: args.ok ? "done" : "failed",
			error: args.ok ? undefined : clip(args.error ?? "It didn't run on your computer.", 300),
			finishedAt: Date.now(),
		});
		return true;
	},
});

/** Mirror a chat's run. `notify` sends a push (the host decides when). */
export const publishRun = mutation({
	args: {
		deviceId: v.string(),
		chatId: v.id("kodeChats"),
		status: runStatus,
		text: v.string(),
		steps: v.array(stepValidator),
		pending: v.array(pendingValidator),
		modelId: v.optional(v.string()),
		notify: v.optional(v.object({ title: v.string(), body: v.string() })),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const device = await requireDevice(ctx, user._id, args.deviceId);
		if (!device.enabled) return null;
		const chat = await requireOwnedChat(ctx, user._id, args.chatId);
		const fields = {
			deviceId: args.deviceId,
			status: args.status,
			text: liveTextTail(args.text),
			steps: args.steps.slice(-MAX_STEPS).map((step) => ({
				id: clip(step.id, 120),
				name: clip(step.name, 80),
				label: clip(step.label, 300),
				state: clip(step.state, 30),
			})),
			pending: args.pending.slice(0, MAX_PENDING),
			modelId: args.modelId,
			updatedAt: Date.now(),
		};
		const existing = await ctx.db
			.query("kodeRemoteRuns")
			.withIndex("by_ownerId_and_chatId", (q) =>
				q.eq("ownerId", user._id).eq("chatId", args.chatId),
			)
			.unique();
		if (existing) await ctx.db.patch(existing._id, fields);
		else await ctx.db.insert("kodeRemoteRuns", { ownerId: user._id, chatId: args.chatId, ...fields });
		if (args.notify) {
			await ctx.scheduler.runAfter(0, internal.kodeRemoteNotify.send, {
				userId: user._id,
				title: clip(args.notify.title, 120),
				body: clip(args.notify.body || chat.title, 240),
				deviceId: args.deviceId,
				chatId: args.chatId,
			});
		}
		return null;
	},
});

/** App start: runs from a previous session are over. */
export const resetRuns = mutation({
	args: { deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireDevice(ctx, user._id, args.deviceId);
		const runs = await ctx.db
			.query("kodeRemoteRuns")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(MAX_CHATS);
		for (const run of runs) {
			if (run.status !== "idle" || run.pending.length > 0) {
				await ctx.db.patch(run._id, { status: "idle", pending: [], text: "", updatedAt: Date.now() });
			}
		}
		return null;
	},
});

// ── Remote clients (mobile + web) ──────────────────────────────────────────

/** The user's computers, newest first. */
export const listDevices = query({
	args: {},
	handler: async (ctx) => {
		const user = await currentUser(ctx);
		if (!user) return [];
		const devices = await ctx.db
			.query("kodeRemoteDevices")
			.withIndex("by_ownerId_and_deviceId", (q) => q.eq("ownerId", user._id))
			.take(MAX_DEVICES);
		const rows = await Promise.all(
			devices.map(async (device) => {
				const presence = await presenceOf(ctx, user._id, device.deviceId);
				const runs = await ctx.db
					.query("kodeRemoteRuns")
					.withIndex("by_ownerId_and_deviceId", (q) =>
						q.eq("ownerId", user._id).eq("deviceId", device.deviceId),
					)
					.take(MAX_CHATS);
				return {
					deviceId: device.deviceId,
					name: device.name,
					platform: device.platform,
					appVersion: device.appVersion ?? null,
					enabled: device.enabled,
					lastSeenAt: presence?.lastSeenAt ?? null,
					running: runs.filter((run) => run.status === "running").length,
					awaiting: runs.filter((run) => run.status === "awaiting").length,
				};
			}),
		);
		return rows.sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
	},
});

/** One computer: its projects and chats with their run status. */
export const deviceOverview = query({
	args: { deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await currentUser(ctx);
		if (!user) return null;
		const device = await findDevice(ctx, user._id, args.deviceId);
		if (!device) return null;
		const presence = await presenceOf(ctx, user._id, args.deviceId);
		const projects = await ctx.db
			.query("kodeRemoteProjects")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(MAX_PROJECTS);
		const links = await ctx.db
			.query("kodeRemoteChatLinks")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(MAX_CHATS);
		const runs = await ctx.db
			.query("kodeRemoteRuns")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(MAX_CHATS);
		const statusByChat = new Map(runs.map((run) => [run.chatId, run.status]));
		const chats = (
			await Promise.all(
				links.map(async (link) => {
					const chat = await ctx.db.get(link.chatId);
					if (!chat || chat.ownerId !== user._id || chat.archived) return null;
					return {
						chatId: chat._id,
						title: chat.title,
						projectKey: link.projectKey,
						updatedAt: chat.updatedAt,
						pinned: chat.pinnedAt != null,
						status: statusByChat.get(chat._id) ?? "idle",
					};
				}),
			)
		)
			.filter((chat) => chat !== null)
			.sort((a, b) => b.updatedAt - a.updatedAt);
		return {
			device: {
				deviceId: device.deviceId,
				name: device.name,
				platform: device.platform,
				enabled: device.enabled,
				lastSeenAt: presence?.lastSeenAt ?? null,
				models: device.models,
				defaultModelId: device.defaultModelId ?? null,
			},
			projects: projects
				.sort((a, b) => a.order - b.order)
				.map((project) => ({ key: project.projectKey, name: project.name })),
			chats,
		};
	},
});

/** A chat's live run on a computer plus prompts still waiting to be sent. */
export const chatLive = query({
	args: { deviceId: v.string(), chatId: v.id("kodeChats") },
	handler: async (ctx, args) => {
		const user = await currentUser(ctx);
		if (!user) return null;
		const chat = await ctx.db.get(args.chatId);
		if (!chat || chat.ownerId !== user._id) return null;
		const device = await findDevice(ctx, user._id, args.deviceId);
		if (!device) return null;
		const run = await ctx.db
			.query("kodeRemoteRuns")
			.withIndex("by_ownerId_and_chatId", (q) =>
				q.eq("ownerId", user._id).eq("chatId", args.chatId),
			)
			.unique();
		const waiting = await ctx.db
			.query("kodeRemoteCommands")
			.withIndex("by_ownerId_and_deviceId_and_status", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId).eq("status", "pending"),
			)
			.take(KODE_REMOTE_MAX_PENDING_COMMANDS);
		const failed = await ctx.db
			.query("kodeRemoteCommands")
			.withIndex("by_ownerId_and_deviceId_and_status", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId).eq("status", "failed"),
			)
			.order("desc")
			.take(10);
		const lastFailure = failed.find(
			(command) => command.chatId === args.chatId && command.error !== CANCELED,
		);
		return {
			title: chat.title,
			run:
				run && run.deviceId === args.deviceId
					? {
							status: run.status,
							text: run.text,
							steps: run.steps,
							pending: run.pending,
							modelId: run.modelId ?? null,
							updatedAt: run.updatedAt,
						}
					: null,
			queued: waiting
				.filter((command) => command.chatId === args.chatId && command.kind === "send")
				.map((command) => ({
					id: command._id,
					text: command.text ?? "",
					createdAt: command.createdAt,
					expiresAt: command.expiresAt,
				})),
			lastError: lastFailure
				? { message: lastFailure.error ?? "Couldn't run on your computer.", at: lastFailure.finishedAt ?? lastFailure.createdAt }
				: null,
		};
	},
});

async function queueCommand(
	ctx: MutationCtx,
	ownerId: Id<"users">,
	device: Doc<"kodeRemoteDevices">,
	command: Omit<
		Doc<"kodeRemoteCommands">,
		"_id" | "_creationTime" | "ownerId" | "deviceId" | "status" | "createdAt" | "expiresAt"
	>,
	ttl: number,
) {
	if (!device.enabled) fail("REMOTE_OFF", "Remote control is off on that computer. Turn it on in Kode's settings.");
	const waiting = await ctx.db
		.query("kodeRemoteCommands")
		.withIndex("by_ownerId_and_deviceId_and_status", (q) =>
			q.eq("ownerId", ownerId).eq("deviceId", device.deviceId).eq("status", "pending"),
		)
		.take(KODE_REMOTE_MAX_PENDING_COMMANDS);
	if (waiting.length >= KODE_REMOTE_MAX_PENDING_COMMANDS) {
		fail("LIMIT", "Your computer has too many waiting requests. Try again once it catches up.");
	}
	const now = Date.now();
	return await ctx.db.insert("kodeRemoteCommands", {
		ownerId,
		deviceId: device.deviceId,
		status: "pending",
		createdAt: now,
		expiresAt: now + ttl,
		...command,
	});
}

/** Send a prompt to a chat on a computer (a new chat when chatId is absent). */
export const sendPrompt = mutation({
	args: {
		deviceId: v.string(),
		chatId: v.optional(v.id("kodeChats")),
		projectKey: v.optional(v.union(v.string(), v.null())),
		text: v.string(),
		modelId: v.optional(v.string()),
		mode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const device = await requireDevice(ctx, user._id, args.deviceId);
		const text = args.text.trim();
		if (!text) fail("INVALID", "Type a message first.");
		if (text.length > KODE_REMOTE_MAX_PROMPT) fail("INVALID", "That message is too long.");
		if (args.modelId && !device.models.some((model) => model.id === args.modelId)) {
			fail("INVALID", "That model isn't available on this computer.");
		}
		const mode = isKodeRemoteMode(args.mode) ? args.mode : KODE_REMOTE_DEFAULT_MODE;

		let chatId = args.chatId;
		let projectKey: string | null = null;
		if (chatId) {
			await requireOwnedChat(ctx, user._id, chatId);
		} else {
			if (args.projectKey) {
				const project = await ctx.db
					.query("kodeRemoteProjects")
					.withIndex("by_ownerId_and_deviceId", (q) =>
						q.eq("ownerId", user._id).eq("deviceId", device.deviceId),
					)
					.take(MAX_PROJECTS);
				if (!project.some((row) => row.projectKey === args.projectKey)) {
					fail("INVALID", "That project isn't on this computer anymore.");
				}
				projectKey = args.projectKey;
			}
			if (!device.enabled) fail("REMOTE_OFF", "Remote control is off on that computer. Turn it on in Kode's settings.");
			const now = Date.now();
			chatId = await ctx.db.insert("kodeChats", {
				ownerId: user._id,
				title: remoteChatTitle(text),
				archived: false,
				lastMessageAt: now,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("kodeRemoteChatLinks", {
				ownerId: user._id,
				deviceId: device.deviceId,
				chatId,
				projectKey,
			});
		}
		await queueCommand(
			ctx,
			user._id,
			device,
			{
				kind: "send",
				chatId,
				projectKey,
				newChat: !args.chatId,
				text,
				modelId: args.modelId,
				mode,
			},
			KODE_REMOTE_SEND_TTL_MS,
		);
		return { chatId };
	},
});

/** Answer what a run is waiting on: an approval or a question. */
export const respond = mutation({
	args: {
		deviceId: v.string(),
		chatId: v.id("kodeChats"),
		stepId: v.string(),
		approved: v.optional(v.boolean()),
		values: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const device = await requireDevice(ctx, user._id, args.deviceId);
		await requireOwnedChat(ctx, user._id, args.chatId);
		const run = await ctx.db
			.query("kodeRemoteRuns")
			.withIndex("by_ownerId_and_chatId", (q) =>
				q.eq("ownerId", user._id).eq("chatId", args.chatId),
			)
			.unique();
		const pending = run?.pending.find((item) => item.id === args.stepId);
		if (!run || run.deviceId !== args.deviceId || !pending) {
			fail("STALE", "That's already been answered.");
		}
		const isApproval = pending.kind === "approval";
		if (isApproval && typeof args.approved !== "boolean") fail("INVALID", "Allow or deny it.");
		await queueCommand(
			ctx,
			user._id,
			device,
			isApproval
				? { kind: "approve", chatId: args.chatId, stepId: args.stepId, approved: args.approved }
				: {
						kind: "answer",
						chatId: args.chatId,
						stepId: args.stepId,
						values: (args.values ?? []).slice(0, 20).map((value) => clip(value, 2_000)),
					},
			KODE_REMOTE_ACTION_TTL_MS,
		);
		// Hide it right away so it can't be answered twice.
		await ctx.db.patch(run._id, {
			pending: run.pending.filter((item) => item.id !== args.stepId),
		});
		return null;
	},
});

/** Stop the chat's run on the computer. */
export const stopRun = mutation({
	args: { deviceId: v.string(), chatId: v.id("kodeChats") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const device = await requireDevice(ctx, user._id, args.deviceId);
		await requireOwnedChat(ctx, user._id, args.chatId);
		await queueCommand(ctx, user._id, device, { kind: "stop", chatId: args.chatId }, KODE_REMOTE_ACTION_TTL_MS);
		return null;
	},
});

/** Drop a prompt that hasn't reached the computer yet. */
export const cancelQueued = mutation({
	args: { commandId: v.id("kodeRemoteCommands") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const command = await ctx.db.get(args.commandId);
		if (!command || command.ownerId !== user._id || command.status !== "pending") return false;
		await ctx.db.patch(command._id, { status: "failed", error: CANCELED, finishedAt: Date.now() });
		return true;
	},
});

/** A remote viewer has the chat open: the computer streams its reply. */
export const watchChat = mutation({
	args: { deviceId: v.string(), chatId: v.id("kodeChats") },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		await requireDevice(ctx, user._id, args.deviceId);
		await requireOwnedChat(ctx, user._id, args.chatId);
		const until = Date.now() + KODE_REMOTE_WATCH_MS;
		const existing = await ctx.db
			.query("kodeRemoteWatchers")
			.withIndex("by_ownerId_and_chatId", (q) =>
				q.eq("ownerId", user._id).eq("chatId", args.chatId),
			)
			.unique();
		if (existing) await ctx.db.patch(existing._id, { deviceId: args.deviceId, until });
		else await ctx.db.insert("kodeRemoteWatchers", { ownerId: user._id, deviceId: args.deviceId, chatId: args.chatId, until });
		return null;
	},
});

/** Unlink a computer (it re-registers if its app is still signed in). */
export const forgetDevice = mutation({
	args: { deviceId: v.string() },
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const device = await requireDevice(ctx, user._id, args.deviceId);
		await failPendingCommands(ctx, user._id, args.deviceId, "That computer was removed.");
		await deleteRunsAndWatchers(ctx, user._id, args.deviceId);
		const projects = await ctx.db
			.query("kodeRemoteProjects")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(MAX_PROJECTS * 2);
		for (const row of projects) await ctx.db.delete(row._id);
		const links = await ctx.db
			.query("kodeRemoteChatLinks")
			.withIndex("by_ownerId_and_deviceId", (q) =>
				q.eq("ownerId", user._id).eq("deviceId", args.deviceId),
			)
			.take(MAX_CHATS * 2);
		for (const row of links) await ctx.db.delete(row._id);
		const presence = await presenceOf(ctx, user._id, args.deviceId);
		if (presence) await ctx.db.delete(presence._id);
		await ctx.db.delete(device._id);
		return null;
	},
});

// ── Housekeeping ───────────────────────────────────────────────────────────

const COMMAND_RETENTION_MS = 60 * 60_000;

/** Expire stale commands and drop finished ones after an hour (crons.ts). */
export const cleanup = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const stale = await ctx.db
			.query("kodeRemoteCommands")
			.withIndex("by_status_and_createdAt", (q) =>
				q.eq("status", "pending").lt("createdAt", now - KODE_REMOTE_ACTION_TTL_MS),
			)
			.take(200);
		for (const command of stale) {
			if (command.expiresAt <= now) {
				await ctx.db.patch(command._id, {
					status: "failed",
					error: "Your computer didn't pick this up in time. Is it awake with Kode open?",
					finishedAt: now,
				});
			}
		}
		for (const status of ["done", "failed"] as const) {
			const old = await ctx.db
				.query("kodeRemoteCommands")
				.withIndex("by_status_and_createdAt", (q) =>
					q.eq("status", status).lt("createdAt", now - COMMAND_RETENTION_MS),
				)
				.take(200);
			for (const command of old) await ctx.db.delete(command._id);
		}
		return null;
	},
});
