import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./kode.ts": () => import("./kode"),
};

const OWNER = { subject: "clerk_history_owner", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_history_owner" };
const OTHER = { subject: "clerk_history_other", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_history_other" };

async function seed(t: ReturnType<typeof convexTest>, count: number) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const ownerId = await ctx.db.insert("users", { clerkUserId: OWNER.subject, email: "owner@example.test", createdAt: now });
		await ctx.db.insert("users", { clerkUserId: OTHER.subject, email: "other@example.test", createdAt: now });
		const chatId = await ctx.db.insert("kodeChats", { ownerId, title: "Long chat", createdAt: now, updatedAt: now });
		for (let order = 0; order < count; order += 1) {
			await ctx.db.insert("kodeMessages", {
				chatId,
				ownerId,
				role: order % 2 === 0 ? "user" : "assistant",
				content: `message ${order}`,
				createdAt: now + order,
				order,
			});
		}
		return chatId;
	});
}

describe("kode.getRecentMessages", () => {
	test("returns the newest page, oldest first, and says older ones exist", async () => {
		const t = convexTest(schema, modules);
		const chatId = await seed(t, 25);
		const page = await t.withIdentity(OWNER).query(api.kode.getRecentMessages, { chatId, limit: 10 });
		expect(page.hasMore).toBe(true);
		expect(page.messages.map((m) => m.content)).toEqual(Array.from({ length: 10 }, (_, i) => `message ${15 + i}`));
	});

	test("a page bigger than the chat returns everything", async () => {
		const t = convexTest(schema, modules);
		const chatId = await seed(t, 4);
		const page = await t.withIdentity(OWNER).query(api.kode.getRecentMessages, { chatId, limit: 60 });
		expect(page.hasMore).toBe(false);
		expect(page.messages).toHaveLength(4);
	});

	test("other users and signed-out callers see nothing", async () => {
		const t = convexTest(schema, modules);
		const chatId = await seed(t, 4);
		expect(await t.withIdentity(OTHER).query(api.kode.getRecentMessages, { chatId, limit: 10 })).toEqual({ messages: [], hasMore: false });
		expect(await t.query(api.kode.getRecentMessages, { chatId, limit: 10 })).toEqual({ messages: [], hasMore: false });
	});
});
