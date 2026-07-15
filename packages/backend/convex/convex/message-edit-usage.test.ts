import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./memoryWorkers.ts": () => import("../test/memoryWorkers"),
	"./messages.ts": () => import("./messages"),
};

const USER = {
	subject: "clerk_edit_usage_user",
	issuer: "https://clerk.test",
	tokenIdentifier: "https://clerk.test|clerk_edit_usage_user",
};

async function seedUserMessage(
	t: ReturnType<typeof convexTest>,
	plan: "free" | "pro_plan",
) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const userId = await ctx.db.insert("users", {
			clerkUserId: USER.subject,
			email: "edit-usage@example.test",
			plan,
			createdAt: now,
		});
		const chatId = await ctx.db.insert("chats", {
			ownerId: userId,
			title: "Edit usage test",
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
			ownerId: userId,
			role: "user",
			content: "Original prompt",
			createdAt: now,
			order: 0,
		});
		return { messageId, userId };
	});
}

describe("server-side chat request usage", () => {
	test("counts a free K-AI request after an edited prompt", async () => {
		const t = convexTest(schema, modules);
		const { messageId, userId } = await seedUserMessage(t, "free");

		await t.withIdentity(USER).mutation(api.messages.updateMessageContent, {
			messageId,
			content: "Edited prompt",
			model: "kontinue/k-ai-1.0",
			isPremiumModel: false,
		});
		await t.withIdentity(USER).mutation(api.messages.consumeChatRequest, {
			model: "kontinue/k-ai-1.0",
		});

		const counts = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("usage")
				.withIndex("by_owner_bucket", (q) => q.eq("ownerId", userId))
				.take(2);
			return Object.fromEntries(
				rows.map((row) => [row.bucketType, row.requestCount]),
			);
		});

		expect(counts.minute).toBe(1);
		expect(counts.month_kai).toBe(1);
	});

	test("uses the Pro bucket and shared credits for a paid-model request", async () => {
		const t = convexTest(schema, modules);
		const { messageId, userId } = await seedUserMessage(t, "pro_plan");

		await t.withIdentity(USER).mutation(api.messages.updateMessageContent, {
			messageId,
			content: "Edited premium prompt",
			model: "anthropic/claude-sonnet-4",
			isPremiumModel: true,
			modelClass: "pro",
		});
		await t.withIdentity(USER).mutation(api.messages.consumeChatRequest, {
			model: "anthropic/claude-sonnet-4",
			modelClass: "pro",
		});

		const premiumUsage = await t.run(async (ctx) => {
			return await ctx.db
				.query("usage")
				.withIndex("by_owner_bucket", (q) =>
					q.eq("ownerId", userId).eq("bucketType", "month_premium"),
				)
				.unique();
		});

		expect(premiumUsage?.requestCount).toBe(1);
		const creditUsage = await t.run(async (ctx) =>
			ctx.db
				.query("usage")
				.withIndex("by_owner_bucket", (q) =>
					q.eq("ownerId", userId).eq("bucketType", "month_ai_credits"),
				)
				.unique(),
		);
		expect(creditUsage?.requestCount).toBe(6);
	});
});
