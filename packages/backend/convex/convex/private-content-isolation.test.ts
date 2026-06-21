import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./memories.ts": () => import("./memories"),
	"./canvas.ts": () => import("./canvas"),
};
const identity = (subject: string) => ({
	subject,
	issuer: "https://clerk.test",
});

async function fixture() {
	const t = convexTest(schema, modules);
	const records = await t.run(async (ctx) => {
		const now = Date.now();
		const userAId = await ctx.db.insert("users", {
			clerkUserId: "user_a",
			email: "a@example.test",
			createdAt: now,
		});
		await ctx.db.insert("users", {
			clerkUserId: "user_b",
			email: "b@example.test",
			createdAt: now,
		});
		const memoryId = await ctx.db.insert("memories", {
			userId: userAId,
			type: "personal_fact",
			content: "A private fact",
			normalizedContent: "a private fact",
			keywords: ["private"],
			embedding: [],
			importanceScore: 1,
			pinned: false,
			manuallySaved: true,
			archived: false,
			sourceMessageIds: [],
			byteSize: 14,
			createdAt: now,
			updatedAt: now,
			lastAccessedAt: now,
		});
		const creationId = await ctx.db.insert("canvasCreations", {
			ownerId: userAId,
			mediaType: "image",
			mediaUrl: "https://blob.test/private",
			pathname: "private.png",
			prompt: "private prompt",
			modelId: "test",
			aspectRatio: "1:1",
			isPublished: false,
			likeCount: 0,
			createdAt: now,
		});
		return { memoryId, creationId };
	});
	return {
		t,
		asA: t.withIdentity(identity("user_a")),
		asB: t.withIdentity(identity("user_b")),
		...records,
	};
}

describe("private content isolation", () => {
	test("ISO-005: user B cannot pin or delete user A's memory", async () => {
		const { t, asB, memoryId } = await fixture();
		await expect(
			asB.mutation(api.memories.pinMemory, { memoryId, pinned: true }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.memories.deleteMemory, { memoryId }),
		).rejects.toThrow();
		expect(await t.run((ctx) => ctx.db.get(memoryId))).not.toBeNull();
	});

	test("ISO-006: an unpublished Canvas creation is owner-only", async () => {
		const { asA, asB, creationId } = await fixture();
		expect(await asB.query(api.canvas.getCreation, { creationId })).toBeNull();
		await expect(
			asB.mutation(api.canvas.publishCreation, { creationId }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.canvas.toggleLike, { creationId }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.canvas.deleteCreation, { creationId }),
		).rejects.toThrow();
		expect(
			await asA.query(api.canvas.getCreation, { creationId }),
		).not.toBeNull();
	});
});
