import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./_generated/api.ts": () => import("./_generated/api"),
	"./kodeRemote.ts": () => import("./kodeRemote"),
	"./kode.ts": () => import("./kode"),
};

const USER = { subject: "clerk_remote_user", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_remote_user" };
const OTHER = { subject: "clerk_remote_other", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_remote_other" };
const DEVICE = "device-mac-1";

async function setup() {
	const t = convexTest(schema, modules);
	await t.run(async (ctx) => {
		const people: [string, string][] = [
			[USER.subject, "remote@example.test"],
			[OTHER.subject, "other@example.test"],
		];
		for (const [id, email] of people) {
			await ctx.db.insert("users", { clerkUserId: id, email, plan: "free", createdAt: Date.now() });
		}
	});
	const me = t.withIdentity(USER);
	const other = t.withIdentity(OTHER);
	await me.mutation(api.kodeRemote.registerDevice, {
		deviceId: DEVICE,
		name: "Studio Mac",
		platform: "macos",
		enabled: true,
		models: [{ id: "kode-1", name: "Kode 1.0" }],
		defaultModelId: "kode-1",
	});
	await me.mutation(api.kodeRemote.syncWorkspace, {
		deviceId: DEVICE,
		projects: [{ key: "p1", name: "web-app" }],
		chats: [],
	});
	return { t, me, other };
}

describe("kode remote control", () => {
	test("a computer shows up online with its projects", async () => {
		const { me, other } = await setup();
		const devices = await me.query(api.kodeRemote.listDevices, {});
		expect(devices).toHaveLength(1);
		expect(devices[0]?.name).toBe("Studio Mac");
		expect(devices[0]?.lastSeenAt).toBeNumber();
		const overview = await me.query(api.kodeRemote.deviceOverview, { deviceId: DEVICE });
		expect(overview?.projects).toEqual([{ key: "p1", name: "web-app" }]);
		// Another account sees nothing.
		expect(await other.query(api.kodeRemote.listDevices, {})).toEqual([]);
		expect(await other.query(api.kodeRemote.deviceOverview, { deviceId: DEVICE })).toBeNull();
	});

	test("a prompt from the phone starts a chat the computer picks up", async () => {
		const { me } = await setup();
		const { chatId } = await me.mutation(api.kodeRemote.sendPrompt, {
			deviceId: DEVICE,
			projectKey: "p1",
			text: "Fix the failing login test",
			mode: "full_access",
		});
		const overview = await me.query(api.kodeRemote.deviceOverview, { deviceId: DEVICE });
		expect(overview?.chats.map((chat) => chat.chatId)).toEqual([chatId]);
		expect(overview?.chats[0]?.projectKey).toBe("p1");

		const host = await me.query(api.kodeRemote.hostState, { deviceId: DEVICE });
		const command = host?.commands[0];
		expect(command?.kind).toBe("send");
		expect(command?.newChat).toBe(true);
		expect(command?.text).toBe("Fix the failing login test");
		// Remote prompts never get the risky modes.
		expect(command?.mode).toBe("supervised");

		const live = await me.query(api.kodeRemote.chatLive, { deviceId: DEVICE, chatId });
		expect(live?.queued).toHaveLength(1);

		expect(await me.mutation(api.kodeRemote.completeCommand, { commandId: command!.id, ok: true })).toBe(true);
		expect((await me.query(api.kodeRemote.hostState, { deviceId: DEVICE }))?.commands).toEqual([]);
		// Completing twice is a no-op.
		expect(await me.mutation(api.kodeRemote.completeCommand, { commandId: command!.id, ok: true })).toBe(false);
	});

	test("approvals reach the computer once and are hidden right away", async () => {
		const { me } = await setup();
		const { chatId } = await me.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, text: "Run the tests" });
		await me.mutation(api.kodeRemote.publishRun, {
			deviceId: DEVICE,
			chatId,
			status: "awaiting",
			text: "Running the suite.",
			steps: [{ id: "s1", name: "run_command", label: "bun test", state: "pending-approval" }],
			pending: [{ id: "s1", kind: "approval", title: "Kode wants to run a command", detail: "bun test" }],
		});
		const live = await me.query(api.kodeRemote.chatLive, { deviceId: DEVICE, chatId });
		expect(live?.run?.status).toBe("awaiting");
		expect(live?.run?.pending[0]?.detail).toBe("bun test");

		await me.mutation(api.kodeRemote.respond, { deviceId: DEVICE, chatId, stepId: "s1", approved: true });
		expect((await me.query(api.kodeRemote.chatLive, { deviceId: DEVICE, chatId }))?.run?.pending).toEqual([]);
		await expect(
			me.mutation(api.kodeRemote.respond, { deviceId: DEVICE, chatId, stepId: "s1", approved: true }),
		).rejects.toThrow();

		const kinds = (await me.query(api.kodeRemote.hostState, { deviceId: DEVICE }))?.commands.map((c) => c.kind);
		expect(kinds).toEqual(["send", "approve"]);
	});

	test("another account can't command, watch or read someone's computer", async () => {
		const { me, other } = await setup();
		const { chatId } = await me.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, text: "Hello" });
		await expect(other.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, text: "rm -rf" })).rejects.toThrow();
		await expect(other.mutation(api.kodeRemote.stopRun, { deviceId: DEVICE, chatId })).rejects.toThrow();
		await expect(other.mutation(api.kodeRemote.watchChat, { deviceId: DEVICE, chatId })).rejects.toThrow();
		await expect(
			other.mutation(api.kodeRemote.publishRun, { deviceId: DEVICE, chatId, status: "idle", text: "", steps: [], pending: [] }),
		).rejects.toThrow();
		expect(await other.query(api.kodeRemote.chatLive, { deviceId: DEVICE, chatId })).toBeNull();
		expect(await other.query(api.kodeRemote.hostState, { deviceId: DEVICE })).toBeNull();

		// Same device id registered by the other account is a separate computer.
		await other.mutation(api.kodeRemote.registerDevice, { deviceId: DEVICE, name: "Theirs", platform: "macos", enabled: true, models: [] });
		expect((await other.query(api.kodeRemote.hostState, { deviceId: DEVICE }))?.commands).toEqual([]);
		await expect(
			other.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, chatId, text: "into your chat" }),
		).rejects.toThrow();
	});

	test("turning remote control off rejects new commands and fails waiting ones", async () => {
		const { me } = await setup();
		const { chatId } = await me.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, text: "Queued" });
		await me.mutation(api.kodeRemote.registerDevice, { deviceId: DEVICE, name: "Studio Mac", platform: "macos", enabled: false, models: [] });
		expect((await me.query(api.kodeRemote.hostState, { deviceId: DEVICE }))?.commands).toEqual([]);
		const live = await me.query(api.kodeRemote.chatLive, { deviceId: DEVICE, chatId });
		expect(live?.queued).toEqual([]);
		expect(live?.lastError?.message).toContain("Remote control is off");
		await expect(me.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, chatId, text: "Again" })).rejects.toThrow();
	});

	test("cleanup expires commands the computer never picked up", async () => {
		const { t, me } = await setup();
		const { chatId } = await me.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, text: "x" });
		await me.mutation(api.kodeRemote.stopRun, { deviceId: DEVICE, chatId });
		await t.run(async (ctx) => {
			const rows = await ctx.db.query("kodeRemoteCommands").collect();
			const old = Date.now() - 15 * 60_000;
			for (const row of rows) await ctx.db.patch(row._id, { createdAt: old, expiresAt: old + 1 });
		});
		await t.mutation(internal.kodeRemote.cleanup, {});
		expect((await me.query(api.kodeRemote.hostState, { deviceId: DEVICE }))?.commands).toEqual([]);
		expect((await me.query(api.kodeRemote.chatLive, { deviceId: DEVICE, chatId }))?.lastError?.message).toContain("didn't pick this up");
	});

	test("deleting a chat removes its remote state", async () => {
		const { t, me } = await setup();
		const { chatId } = await me.mutation(api.kodeRemote.sendPrompt, { deviceId: DEVICE, text: "Temp" });
		await me.mutation(api.kodeRemote.watchChat, { deviceId: DEVICE, chatId });
		await me.mutation(api.kodeRemote.publishRun, { deviceId: DEVICE, chatId, status: "running", text: "…", steps: [], pending: [] });
		await me.mutation(api.kode.deleteChat, { chatId });
		const left = await t.run(async (ctx) => ({
			links: (await ctx.db.query("kodeRemoteChatLinks").collect()).length,
			runs: (await ctx.db.query("kodeRemoteRuns").collect()).length,
			watchers: (await ctx.db.query("kodeRemoteWatchers").collect()).length,
		}));
		expect(left).toEqual({ links: 0, runs: 0, watchers: 0 });
	});
});
