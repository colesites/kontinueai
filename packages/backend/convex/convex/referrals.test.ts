import { describe, expect, test } from "bun:test";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

type Harness = TestConvex<typeof schema>;

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./users.ts": () => import("./users"),
	"./referrals.ts": () => import("./referrals"),
	"./canvas.ts": () => import("./canvas"),
};

const identity = (subject: string) => ({
	subject,
	issuer: "https://clerk.test",
	tokenIdentifier: `https://clerk.test|${subject}`,
});

const FREE = { subscriptionStatus: "inactive", plan: "free" };
const STARTER = { subscriptionStatus: "active", plan: "starter_plan" };
const PRO = { subscriptionStatus: "active", plan: "pro_plan" };

async function userIdFor(
	t: Harness,
	clerkUserId: string,
): Promise<Id<"users">> {
	return await t.run(async (ctx) => {
		const u = await ctx.db
			.query("users")
			.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", clerkUserId))
			.unique();
		if (!u) throw new Error("user not found");
		return u._id;
	});
}

async function seedBonus(t: Harness, ownerId: Id<"users">, amount: number) {
	await t.run(async (ctx) => {
		await ctx.db.insert("videoCredits", {
			ownerId,
			monthKey: "bonus",
			totalCredits: amount,
			usedCredits: 0,
			updatedAt: Date.now(),
		});
	});
}

describe("referral attribution + reward", () => {
	test("rewards the referrer once when an invited user pays", async () => {
		const t = convexTest(schema, modules);
		const asA = t.withIdentity(identity("user_a"));
		const asB = t.withIdentity(identity("user_b"));

		await asA.mutation(api.users.getOrCreateUser, { email: "a@test", ...FREE });
		const code = await asA.mutation(api.referrals.ensureReferralCode, {});
		expect(code).toBeTruthy();

		// B signs up via A's invite link, still free → pending referral.
		await asB.mutation(api.users.getOrCreateUser, {
			email: "b@test",
			...FREE,
			referralCode: code,
		});

		let summary = await asA.query(api.referrals.getReferralSummary, {});
		expect(summary.invitedCount).toBe(1);
		expect(summary.convertedCount).toBe(0);
		expect(summary.bonusRemaining).toBe(0);

		// B upgrades to a paid plan → A is rewarded 100 credits.
		await asB.mutation(api.users.getOrCreateUser, {
			email: "b@test",
			...STARTER,
		});

		summary = await asA.query(api.referrals.getReferralSummary, {});
		expect(summary.convertedCount).toBe(1);
		expect(summary.bonusTotal).toBe(100);
		expect(summary.bonusRemaining).toBe(100);

		// A repeat paid sync (e.g. Starter → Pro) must NOT grant again.
		await asB.mutation(api.users.getOrCreateUser, { email: "b@test", ...PRO });
		summary = await asA.query(api.referrals.getReferralSummary, {});
		expect(summary.convertedCount).toBe(1);
		expect(summary.bonusTotal).toBe(100);
	});

	test("grants nothing while the invited user stays free", async () => {
		const t = convexTest(schema, modules);
		const asA = t.withIdentity(identity("user_a"));
		const asB = t.withIdentity(identity("user_b"));

		await asA.mutation(api.users.getOrCreateUser, { email: "a@test", ...FREE });
		const code = await asA.mutation(api.referrals.ensureReferralCode, {});
		await asB.mutation(api.users.getOrCreateUser, {
			email: "b@test",
			...FREE,
			referralCode: code,
		});

		const summary = await asA.query(api.referrals.getReferralSummary, {});
		expect(summary.invitedCount).toBe(1);
		expect(summary.convertedCount).toBe(0);
		expect(summary.bonusRemaining).toBe(0);
	});

	test("stacks rewards across multiple paid referrals", async () => {
		const t = convexTest(schema, modules);
		const asA = t.withIdentity(identity("user_a"));
		const asB = t.withIdentity(identity("user_b"));
		const asC = t.withIdentity(identity("user_c"));

		await asA.mutation(api.users.getOrCreateUser, { email: "a@test", ...FREE });
		const code = await asA.mutation(api.referrals.ensureReferralCode, {});

		for (const [who, email] of [
			[asB, "b@test"],
			[asC, "c@test"],
		] as const) {
			await who.mutation(api.users.getOrCreateUser, {
				email,
				...FREE,
				referralCode: code,
			});
			await who.mutation(api.users.getOrCreateUser, { email, ...PRO });
		}

		const summary = await asA.query(api.referrals.getReferralSummary, {});
		expect(summary.invitedCount).toBe(2);
		expect(summary.convertedCount).toBe(2);
		expect(summary.bonusTotal).toBe(200);
		expect(summary.bonusRemaining).toBe(200);
	});

	test("ignores an unknown invite code", async () => {
		const t = convexTest(schema, modules);
		const asB = t.withIdentity(identity("user_b"));
		await asB.mutation(api.users.getOrCreateUser, {
			email: "b@test",
			...FREE,
			referralCode: "NOPE1234",
		});
		// Becoming paid with no valid referral grants nothing and doesn't error.
		await asB.mutation(api.users.getOrCreateUser, { email: "b@test", ...PRO });
		const summary = await asB.query(api.referrals.getReferralSummary, {});
		expect(summary.invitedCount).toBe(0);
		expect(summary.bonusRemaining).toBe(0);
	});
});

describe("video credit spend order", () => {
	test("Pro draws the monthly video allowance before the bonus pool", async () => {
		const t = convexTest(schema, modules);
		const asP = t.withIdentity(identity("user_p"));
		await asP.mutation(api.users.getOrCreateUser, { email: "p@test", ...PRO });
		await seedBonus(t, await userIdFor(t, "user_p"), 400);

		// Pro includes 60 seconds, represented by a 900-credit monthly video pool.
		// 25 seconds at 480p costs 250 and comes entirely from that pool.
		await asP.mutation(api.canvas.deductCredits, {
			seconds: 25,
			modelId: "veo3",
			resolution: "480p",
		});
		let credits = await asP.query(api.canvas.getCredits, {});
		expect(credits.monthly.remaining).toBe(650);
		expect(credits.bonus.remaining).toBe(400);

		// The remaining 35 seconds at 1080p cost 700: 650 monthly + 50 bonus.
		await asP.mutation(api.canvas.deductCredits, {
			seconds: 35,
			modelId: "veo3",
			resolution: "1080p",
		});
		credits = await asP.query(api.canvas.getCredits, {});
		expect(credits.monthly.remaining).toBe(0);
		expect(credits.bonus.remaining).toBe(350);
		expect(credits.available).toBe(350);
	});

	test("Free cannot generate video even when referral credits are available", async () => {
		const t = convexTest(schema, modules);
		const asF = t.withIdentity(identity("user_f"));
		await asF.mutation(api.users.getOrCreateUser, { email: "f@test", ...FREE });
		await seedBonus(t, await userIdFor(t, "user_f"), 50);

		// Shared or bonus credits never override a plan's product-specific cap.
		const credits0 = await asF.query(api.canvas.getCredits, {});
		expect(credits0.available).toBe(50);

		await expect(
			asF.mutation(api.canvas.deductCredits, {
				seconds: 3,
				modelId: "veo3",
				resolution: "480p",
			}),
		).rejects.toThrow("Free K-Video limit reached");
		const credits1 = await asF.query(api.canvas.getCredits, {});
		expect(credits1.bonus.remaining).toBe(50);
	});
});
