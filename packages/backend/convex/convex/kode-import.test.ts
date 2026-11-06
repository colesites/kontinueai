import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./kode.ts": () => import("./kode"),
	"./kodeUsage.ts": () => import("./kodeUsage"),
};

const USER = {
	subject: "clerk_kode_import_user",
	issuer: "https://clerk.test",
	tokenIdentifier: "https://clerk.test|clerk_kode_import_user",
};

const TURN_TIME = 1_767_225_600_000;

async function seedUser(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) => {
		await ctx.db.insert("users", {
			clerkUserId: USER.subject,
			email: "kode-import@example.test",
			plan: "free",
			createdAt: Date.now(),
		});
	});
}

describe("kode.importSession", () => {
	test("creates the chat and every turn atomically with import metadata", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t);

		const chatId = await t.withIdentity(USER).mutation(api.kode.importSession, {
			title: "Fix auth",
			provider: "claude_code",
			sessionId: "sess-1",
			projectPath: "/tmp/project",
			lastActivity: TURN_TIME + 500,
			model: "claude-x",
			messages: [
				{ role: "user", content: "Fix the login flow", timestamp: TURN_TIME },
				{
					role: "assistant",
					content: "I'll inspect the auth middleware.",
					timestamp: TURN_TIME + 100,
				},
				{ role: "user", content: "Also add a regression test" },
			],
		});

		const chats = await t.withIdentity(USER).query(api.kode.getUserChats, {});
		expect(chats).toHaveLength(1);
		const chat = chats[0]!;
		expect(chat._id).toBe(chatId);
		expect(chat.title).toBe("Fix auth");
		expect(chat.importSource).toMatchObject({
			provider: "claude_code",
			sessionId: "sess-1",
			projectPath: "/tmp/project",
			lastActivity: TURN_TIME + 500,
		});

		const stored = await t
			.withIdentity(USER)
			.query(api.kode.getMessages, { chatId });
		expect(
			stored.map((message) => ({
				role: message.role,
				content: message.content,
				order: message.order,
			})),
		).toEqual([
			{ role: "user", content: "Fix the login flow", order: 0 },
			{
				role: "assistant",
				content: "I'll inspect the auth middleware.",
				order: 1,
			},
			{ role: "user", content: "Also add a regression test", order: 2 },
		]);
		expect(stored[0]?.createdAt).toBe(TURN_TIME);
		expect(stored[0]?.metadata?.model).toBe("claude-x");

		// Imported turns were already paid for in Claude Code — they must not
		// consume the user's Kontinue token budget.
		const usage = await t.withIdentity(USER).query(api.kodeUsage.getUsage, {});
		expect(usage?.session.used).toBe(0);
		expect(usage?.weekly.used).toBe(0);
	});

	test("rejects pathological payloads", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t);

		const tooMany = Array.from({ length: 501 }, (_, index) => ({
			role: "user" as const,
			content: `Message ${index}`,
		}));
		await expect(
			t.withIdentity(USER).mutation(api.kode.importSession, {
				title: "Huge",
				provider: "codex",
				sessionId: "sess-huge",
				messages: tooMany,
			}),
		).rejects.toThrow(/too many messages/i);

		await expect(
			t.withIdentity(USER).mutation(api.kode.importSession, {
				title: "Large",
				provider: "codex",
				sessionId: "sess-large",
				messages: [{ role: "user", content: "x".repeat(50_001) }],
			}),
		).rejects.toThrow(/too large/i);
	});

	test("appends new turns and advances the sync checkpoint", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t);

		const chatId = await t.withIdentity(USER).mutation(api.kode.importSession, {
			title: "Sync",
			provider: "claude_code",
			sessionId: "sess-sync",
			messages: [
				{ role: "user", content: "One", timestamp: TURN_TIME },
				{ role: "assistant", content: "Two", timestamp: TURN_TIME + 100 },
				{ role: "user", content: "Three", timestamp: TURN_TIME + 200 },
			],
		});

		const newCount = await t
			.withIdentity(USER)
			.mutation(api.kode.appendImportedMessages, {
				chatId,
				expectedMessageCount: 3,
				model: "claude-x",
				messages: [
					{
						role: "assistant",
						content: "Four",
						timestamp: TURN_TIME + 300,
					},
					{ role: "user", content: "Five" },
					{ role: "system", content: "Try again" },
				],
			});
		expect(newCount).toBe(6);

		const messages = await t
			.withIdentity(USER)
			.query(api.kode.getMessages, { chatId });
		expect(messages.map((message) => message.order)).toEqual([
			0, 1, 2, 3, 4, 5,
		]);
		expect(messages[3]?.content).toBe("Four");
		expect(messages[4]?.content).toBe("Five");
		expect(messages[5]?.role).toBe("system");
		expect(messages[5]?.content).toBe("Try again");

		const chats = await t.withIdentity(USER).query(api.kode.getUserChats, {});
		expect(chats[0]?.importSource).toMatchObject({
			provider: "claude_code",
			sessionId: "sess-sync",
			syncedMessageCount: 6,
		});

		// Stale sync attempts must fail rather than duplicate or interleave turns.
		await expect(
			t.withIdentity(USER).mutation(api.kode.appendImportedMessages, {
				chatId,
				expectedMessageCount: 3,
				messages: [{ role: "user", content: "Duplicate" }],
			}),
		).rejects.toThrow(/out of sync/i);
	});

	test("rewind uses message order, not creation time", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t);

		const chatId = await t.withIdentity(USER).mutation(api.kode.importSession, {
			title: "Rewind",
			provider: "codex",
			sessionId: "sess-rewind",
			// Every turn gets the same timestamp, so `_creationTime` is identical —
			// exactly the shape produced by a single-transaction import.
			messages: [
				{ role: "user", content: "One", timestamp: TURN_TIME },
				{ role: "assistant", content: "Two", timestamp: TURN_TIME },
				{ role: "user", content: "Three", timestamp: TURN_TIME },
				{ role: "assistant", content: "Four", timestamp: TURN_TIME },
			],
		});

		const before = await t
			.withIdentity(USER)
			.query(api.kode.getMessages, { chatId });
		const second = before.find((message) => message.order === 1);
		expect(second).toBeDefined();

		await t.withIdentity(USER).mutation(api.kode.deleteMessagesAfter, {
			messageId: second!._id,
			inclusive: true,
		});

		const after = await t
			.withIdentity(USER)
			.query(api.kode.getMessages, { chatId });
		expect(after.map((message) => message.order)).toEqual([0]);
	});
});
