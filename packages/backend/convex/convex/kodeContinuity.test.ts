import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./kode.ts": () => import("./kode"),
	"./kodeContinuity.ts": () => import("./kodeContinuity"),
};
const USER = { subject: "clerk_cont_user", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_cont_user" };
const OTHER = { subject: "clerk_cont_other", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_cont_other" };

async function setup() {
	const t = convexTest(schema, modules);
	const chat = await t.run(async (ctx) => {
		const me = await ctx.db.insert("users", { clerkUserId: USER.subject, email: "c@example.test", plan: "free", createdAt: Date.now() });
		await ctx.db.insert("users", { clerkUserId: OTHER.subject, email: "o@example.test", plan: "free", createdAt: Date.now() });
		return ctx.db.insert("kodeChats", { ownerId: me, title: "x", archived: false, createdAt: 1, updatedAt: 1 });
	});
	return { t, chat };
}

test("an agent session is kept once per chat and provider, for its owner only", async () => {
	const { t, chat } = await setup();
	const me = t.withIdentity(USER);
	await me.mutation(api.kodeContinuity.saveCliSession, { chatId: chat, instanceId: "claude", sessionId: "s1", device: "mac-1" });
	await me.mutation(api.kodeContinuity.saveCliSession, { chatId: chat, instanceId: "claude", sessionId: "s2", device: "mac-1" });
	const sessions = await me.query(api.kodeContinuity.listCliSessions, {});
	expect(sessions).toHaveLength(1);
	expect(sessions[0]).toMatchObject({ sessionId: "s2", device: "mac-1" });
	await expect(
		t.withIdentity(OTHER).mutation(api.kodeContinuity.saveCliSession, { chatId: chat, instanceId: "claude", sessionId: "x", device: "pc" }),
	).rejects.toThrow();
	expect(await t.withIdentity(OTHER).query(api.kodeContinuity.listCliSessions, {})).toHaveLength(0);
});

test("a scheduled prompt is sent by one device only", async () => {
	const { t, chat } = await setup();
	const me = t.withIdentity(USER);
	const prompt = { localId: "sched-1", chatId: chat, text: "continue", modelId: "m", mode: "supervised", reason: "limit", fireAt: 10, createdAt: 1 };
	await me.mutation(api.kodeContinuity.upsertScheduledPrompt, prompt);
	expect(await me.query(api.kodeContinuity.listScheduledPrompts, {})).toHaveLength(1);
	expect(await me.mutation(api.kodeContinuity.claimScheduledPrompt, { localId: "sched-1", device: "mac-1" })).toBe("claimed");
	expect(await me.mutation(api.kodeContinuity.claimScheduledPrompt, { localId: "sched-1", device: "mac-2" })).toBe("taken");
	// Claimed prompts no longer show up to be merged on other devices.
	expect(await me.query(api.kodeContinuity.listScheduledPrompts, {})).toHaveLength(0);
	await me.mutation(api.kodeContinuity.removeScheduledPrompt, { localId: "sched-1" });
	expect(await me.mutation(api.kodeContinuity.claimScheduledPrompt, { localId: "sched-1", device: "mac-1" })).toBe("missing");
});
