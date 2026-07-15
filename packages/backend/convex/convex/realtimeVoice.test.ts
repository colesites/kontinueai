import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./realtimeVoice.ts": () => import("./realtimeVoice"),
};

const identity = (subject: string) => ({
	subject,
	issuer: "https://clerk.test",
	tokenIdentifier: `https://clerk.test|${subject}`,
});

async function seedUser(
	t: ReturnType<typeof convexTest>,
	subject: string,
	plan: "free" | "starter_plan" | "pro_plan" | "max_plan",
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("users", {
			clerkUserId: subject,
			email: `${subject}@example.test`,
			plan,
			createdAt: Date.now(),
		});
	});
}

describe("realtime voice entitlements and metering", () => {
	test("maps Pro and Max to their plan models and session caps", async () => {
		for (const testCase of [
			{
				subject: "voice-pro",
				plan: "pro_plan" as const,
				model: "openai/gpt-realtime-1.5",
				maxSessionSeconds: 900,
			},
			{
				subject: "voice-max",
				plan: "max_plan" as const,
				model: "openai/gpt-realtime-2.1",
				maxSessionSeconds: 1800,
			},
		] as const) {
			const t = convexTest(schema, modules);
			await seedUser(t, testCase.subject, testCase.plan);
			const result = await t
				.withIdentity(identity(testCase.subject))
				.mutation(api.realtimeVoice.startSession, {});
			expect(result.model).toBe(testCase.model);
			expect(result.maxSessionSeconds).toBe(testCase.maxSessionSeconds);
		}
	});

	test("does not mint a session for a free account", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t, "voice-free", "free");
		await expect(
			t
				.withIdentity(identity("voice-free"))
				.mutation(api.realtimeVoice.startSession, {}),
		).rejects.toThrow("Kontinue Live is available on Pro and Max");
	});

	test("meters server elapsed time and hides sessions from other users", async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, "voice-owner", "pro_plan");
		await seedUser(t, "voice-stranger", "pro_plan");
		const owner = t.withIdentity(identity("voice-owner"));
		const session = await owner.mutation(api.realtimeVoice.startSession, {});

		const foreignSetup = await t
			.withIdentity(identity("voice-stranger"))
			.query(api.realtimeVoice.getSessionSetup, {
				sessionId: session.sessionId,
			});
		expect(foreignSetup).toBeNull();

		await t.run(async (ctx) => {
			await ctx.db.patch(session.sessionId, {
				lastMeteredAt: Date.now() - 16_000,
			});
		});
		await owner.mutation(api.realtimeVoice.meterSession, {
			sessionId: session.sessionId,
		});

		const usage = await t.run(async (ctx) => {
			return await ctx.db
				.query("realtimeVoiceUsage")
				.withIndex("by_owner_and_month", (q) => q.eq("ownerId", ownerId))
				.unique();
		});
		expect(usage?.usedSeconds).toBeGreaterThanOrEqual(15);
		expect(usage?.usedSeconds).toBeLessThanOrEqual(17);
	});
});
