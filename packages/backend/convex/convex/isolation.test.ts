import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./chats.ts": () => import("./chats"),
	"./messages.ts": () => import("./messages"),
};

const USER_A = {
	subject: "clerk_user_a",
	issuer: "https://clerk.test",
	tokenIdentifier: "https://clerk.test|clerk_user_a",
};

const USER_B = {
	subject: "clerk_user_b",
	issuer: "https://clerk.test",
	tokenIdentifier: "https://clerk.test|clerk_user_b",
};

async function seedTwoUsers(t: ReturnType<typeof convexTest>) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const userAId = await ctx.db.insert("users", {
			clerkUserId: USER_A.subject,
			email: "user-a@example.test",
			plan: "pro_plan",
			createdAt: now,
		});
		const userBId = await ctx.db.insert("users", {
			clerkUserId: USER_B.subject,
			email: "user-b@example.test",
			plan: "pro_plan",
			createdAt: now,
		});
		return { userAId, userBId, now };
	});
}

describe("cross-user isolation", () => {
	test("ISO-001: user B cannot read or mutate user A's chat and messages", async () => {
		const t = convexTest(schema, modules);
		const { userAId, now } = await seedTwoUsers(t);
		const { chatId, messageId } = await t.run(async (ctx) => {
			const chatId = await ctx.db.insert("chats", {
				ownerId: userAId,
				title: "User A private chat",
				archived: false,
				createdAt: now,
				updatedAt: now,
				source: {
					provider: "test",
					importedAt: now,
					importMethod: "manual",
				},
			});
			const messageId = await ctx.db.insert("messages", {
				chatId,
				ownerId: userAId,
				role: "user",
				content: "User A private message",
				createdAt: now,
				order: 0,
			});
			return { chatId, messageId };
		});

		const asUserB = t.withIdentity(USER_B);
		expect(await asUserB.query(api.chats.getChat, { chatId })).toBeNull();
		expect(await asUserB.query(api.chats.getUserChats, {})).toEqual([]);
		expect(await asUserB.query(api.messages.getMessages, { chatId })).toEqual(
			[],
		);
		await expect(
			asUserB.mutation(api.messages.addMessage, {
				chatId,
				role: "user",
				content: "stolen",
			}),
		).rejects.toThrow();
		await expect(
			asUserB.mutation(api.messages.updateMessageContent, {
				messageId,
				content: "stolen",
			}),
		).rejects.toThrow();
		await expect(
			asUserB.mutation(api.messages.deleteMessagesAfter, {
				messageId,
				inclusive: true,
			}),
		).rejects.toThrow();
		await expect(
			asUserB.mutation(api.chats.toggleChatPin, {
				chatId,
				pinned: true,
			}),
		).rejects.toThrow();
		await expect(
			asUserB.mutation(api.chats.setChatArchived, {
				chatId,
				archived: true,
			}),
		).rejects.toThrow();
		await expect(
			asUserB.mutation(api.chats.updateChatTitle, {
				chatId,
				title: "Stolen",
			}),
		).rejects.toThrow();
		await expect(
			asUserB.mutation(api.chats.deleteChat, { chatId }),
		).rejects.toThrow();

		const unchanged = await t.withIdentity(USER_A).query(api.chats.getChat, {
			chatId,
		});
		expect(unchanged?.title).toBe("User A private chat");
	});
});
