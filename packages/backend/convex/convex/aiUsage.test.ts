import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./aiUsage.ts": () => import("./aiUsage"),
};

const USER = {
	subject: "clerk_ai_usage_user",
	issuer: "https://clerk.test",
	tokenIdentifier: "https://clerk.test|clerk_ai_usage_user",
};

describe("aiUsage.getUsage", () => {
	test("is public and returns the authenticated user's monthly credit usage", async () => {
		const t = convexTest(schema, modules);
		const monthStartMs = (() => {
			const now = new Date();
			return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
		})();

		await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				clerkUserId: USER.subject,
				email: "ai-usage@example.test",
				plan: "plus_plan",
				createdAt: Date.now(),
			});
			await ctx.db.insert("usage", {
				ownerId,
				bucketType: "month_ai_credits",
				bucketStartMs: monthStartMs,
				requestCount: 125,
				updatedAt: Date.now(),
			});
		});

		await expect(
			t.withIdentity(USER).query(api.aiUsage.getUsage, {}),
		).resolves.toEqual({
			tier: "plus",
			used: 125,
			limit: 4_000,
			remaining: 3_875,
		});
	});
});
