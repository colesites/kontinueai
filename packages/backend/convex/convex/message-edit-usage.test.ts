import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
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

describe("edited message usage", () => {
	test("counts a free-model edit as another monthly request", async () => {
		const t = convexTest(schema, modules);
		const { messageId, userId } = await seedUserMessage(t, "free");

		await t.withIdentity(USER).mutation(api.messages.updateMessageContent, {
			messageId,
			content: "Edited prompt",
			model: "openai/gpt-4.1-mini",
			isPremiumModel: false,
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
		expect(counts.month).toBe(1);
	});

	test("uses the premium bucket for a paid-model edit", async () => {
		const t = convexTest(schema, modules);
		const { messageId, userId } = await seedUserMessage(t, "pro_plan");

		await t.withIdentity(USER).mutation(api.messages.updateMessageContent, {
			messageId,
			content: "Edited premium prompt",
			model: "anthropic/claude-sonnet-4",
			isPremiumModel: true,
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
	});
});
