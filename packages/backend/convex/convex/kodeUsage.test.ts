import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { getKodeUsageLimits } from "@repo/ai/lib/kode-usage";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./kodeUsage.ts": () => import("./kodeUsage"),
};

const USER = {
	subject: "clerk_kode_usage_user",
	issuer: "https://clerk.test",
	tokenIdentifier: "https://clerk.test|clerk_kode_usage_user",
};

async function seed(t: ReturnType<typeof convexTest>, plan: string) {
	return await t.run(async (ctx) =>
		ctx.db.insert("users", {
			clerkUserId: USER.subject,
			email: "kode-usage@example.test",
			plan,
			createdAt: Date.now(),
		}),
	);
}

describe("kodeUsage", () => {
	test("free plan: Kode 1.0 allowed, frontier locked", async () => {
		const t = convexTest(schema, modules);
		await seed(t, "free");
		const kode = await t.withIdentity(USER).query(api.kodeUsage.authorize, { modelId: "kontinue/kode-1.0" });
		expect(kode.allowed).toBe(true);
		const opus = await t.withIdentity(USER).query(api.kodeUsage.authorize, { modelId: "anthropic/claude-opus-5.5" });
		expect(opus.allowed).toBe(false);
		if (!opus.allowed) expect(opus.reason).toBe("locked");
	});

	test("records real cost and enforces the 5-hour window", async () => {
		const t = convexTest(schema, modules);
		await seed(t, "plus");
		const asUser = t.withIdentity(USER);
		// Gemini 3.8 Flash: 1M fresh input tokens = $0.75 > Plus session ($0.54).
		const result = await asUser.mutation(api.kodeUsage.record, {
			modelId: "google/gemini-3.8-flash",
			fast: false,
			inputTokens: 1_000_000,
			outputTokens: 0,
		});
		expect(result.micros).toBe(750_000);

		const usage = await asUser.query(api.kodeUsage.getUsage, {});
		expect(usage?.session.used).toBe(750_000);
		expect(usage?.session.limit).toBe(getKodeUsageLimits("plus").sessionMicros);
		expect(usage?.session.resetAt).not.toBeNull();

		const blocked = await asUser.query(api.kodeUsage.authorize, { modelId: "google/gemini-3.8-flash" });
		expect(blocked.allowed).toBe(false);
		// Kode 1.0 keeps working from the relaxed allowance.
		const relaxed = await asUser.query(api.kodeUsage.authorize, { modelId: "kontinue/kode-1.0" });
		expect(relaxed.allowed).toBe(true);
		if (relaxed.allowed) expect(relaxed.source).toBe("relaxed");
	});

	test("cached input is billed at the cache rate", async () => {
		const t = convexTest(schema, modules);
		await seed(t, "pro_v2");
		const result = await t.withIdentity(USER).mutation(api.kodeUsage.record, {
			modelId: "kontinue/kode-1.0",
			fast: false,
			inputTokens: 1_000_000,
			cachedInputTokens: 1_000_000,
			outputTokens: 0,
		});
		expect(result.micros).toBe(7_000); // $0.007 per 1M cached tokens
	});

	test("ultra models on Pro need credits, then spend them", async () => {
		const t = convexTest(schema, modules);
		const userId = await seed(t, "pro_v2");
		const asUser = t.withIdentity(USER);
		const before = await asUser.query(api.kodeUsage.authorize, { modelId: "anthropic/claude-fable-5.1" });
		expect(before.allowed).toBe(false);

		await t.mutation(internal.kodeUsage.grantCredits, { userId, micros: 5_000_000 });
		const after = await asUser.query(api.kodeUsage.authorize, { modelId: "anthropic/claude-fable-5.1" });
		expect(after.allowed).toBe(true);
		if (after.allowed) expect(after.source).toBe("credits");

		await asUser.mutation(api.kodeUsage.record, {
			modelId: "anthropic/claude-fable-5.1",
			fast: false,
			inputTokens: 100_000,
			outputTokens: 10_000,
		});
		const usage = await asUser.query(api.kodeUsage.getUsage, {});
		// $1.50 model cost × 1.5 credit markup.
		expect(usage?.creditsMicros).toBe(5_000_000 - 2_250_000);
		expect(usage?.credits.monthSpent).toBe(2_250_000);
		expect(usage?.weekly.used).toBe(0);
	});

	test("payment grants are idempotent and need the secret", async () => {
		process.env.KODE_SERVER_SECRET = "test-secret";
		const t = convexTest(schema, modules);
		await seed(t, "plus");
		const args = {
			secret: "test-secret",
			clerkUserId: USER.subject,
			paymentId: "cs_test_1",
			micros: 10_000_000,
			amountCents: 1_000,
		};
		expect((await t.mutation(api.kodeUsage.grantCreditsFromPayment, args)).granted).toBe(true);
		expect((await t.mutation(api.kodeUsage.grantCreditsFromPayment, args)).granted).toBe(false);
		await expect(
			t.mutation(api.kodeUsage.grantCreditsFromPayment, { ...args, paymentId: "cs_2", secret: "nope" }),
		).rejects.toThrow(/unauthorized/i);
		const usage = await t.withIdentity(USER).query(api.kodeUsage.getUsage, {});
		expect(usage?.creditsMicros).toBe(10_000_000);
	});

	test("credits only cover plan overflow when auto-use is on and under the cap", async () => {
		const t = convexTest(schema, modules);
		const userId = await seed(t, "plus");
		const asUser = t.withIdentity(USER);
		await t.mutation(internal.kodeUsage.grantCredits, { userId, micros: 10_000_000 });
		// Exhaust the 5-hour window.
		await asUser.mutation(api.kodeUsage.record, {
			modelId: "google/gemini-3.8-flash",
			fast: false,
			inputTokens: 1_000_000,
			outputTokens: 0,
		});
		const on = await asUser.query(api.kodeUsage.authorize, { modelId: "google/gemini-3.8-flash" });
		expect(on.allowed && on.source).toBe("credits");

		await asUser.mutation(api.kodeUsage.setCreditSettings, { autoUse: false });
		const off = await asUser.query(api.kodeUsage.authorize, { modelId: "google/gemini-3.8-flash" });
		expect(off.allowed).toBe(false);

		await asUser.mutation(api.kodeUsage.setCreditSettings, { autoUse: true, monthlyLimitMicros: 0 });
		const capped = await asUser.query(api.kodeUsage.authorize, { modelId: "google/gemini-3.8-flash" });
		expect(capped.allowed).toBe(false);
	});

	test("records hourly history per model", async () => {
		const t = convexTest(schema, modules);
		await seed(t, "pro_v2");
		const asUser = t.withIdentity(USER);
		for (const modelId of ["kontinue/kode-1.0", "kontinue/kode-1.0", "anthropic/claude-opus-5.5"]) {
			await asUser.mutation(api.kodeUsage.record, { modelId, fast: false, inputTokens: 10_000, outputTokens: 1_000 });
		}
		const history = await asUser.query(api.kodeUsage.getUsageHistory, {});
		expect(history?.hours.reduce((sum, h) => sum + h.requests, 0)).toBe(3);
		expect(history?.models[0]?.modelId).toBe("anthropic/claude-opus-5.5");
		expect(history?.models.find((m) => m.modelId === "kontinue/kode-1.0")?.requests).toBe(2);
	});
});
