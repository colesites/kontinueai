import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./kodeProjectMoves.ts": () => import("./kodeProjectMoves"),
};
const USER = { subject: "clerk_move_user", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_move_user" };
const OTHER = { subject: "clerk_move_other", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|clerk_move_other" };

test("a project move is claimed once, by its owner only", async () => {
	const t = convexTest(schema, modules);
	const { mine, theirs } = await t.run(async (ctx) => {
		const me = await ctx.db.insert("users", { clerkUserId: USER.subject, email: "m@example.test", plan: "free", createdAt: Date.now() });
		const other = await ctx.db.insert("users", { clerkUserId: OTHER.subject, email: "o@example.test", plan: "free", createdAt: Date.now() });
		const base = { title: "x", archived: false, createdAt: 1, updatedAt: 1 };
		return {
			mine: await ctx.db.insert("kodeChats", { ...base, ownerId: me }),
			theirs: await ctx.db.insert("kodeChats", { ...base, ownerId: other }),
		};
	});
	const me = t.withIdentity(USER);
	const id = await me.mutation(api.kodeProjectMoves.sendProjectMove, {
		name: "app", remoteUrl: "git@github.com:a/app.git", branch: "main", headSha: "abc", headPushed: true,
		patch: "diff --git a/x b/x", changedFiles: ["x"], chatIds: [mine, theirs], fromDevice: "mac-1",
	});
	const listed = await me.query(api.kodeProjectMoves.listProjectMoves, {});
	expect(listed).toHaveLength(1);
	expect(listed[0]).toMatchObject({ name: "app", chats: 1, changedFiles: 1 });
	expect(await t.withIdentity(OTHER).query(api.kodeProjectMoves.listProjectMoves, {})).toHaveLength(0);
	await expect(t.withIdentity(OTHER).mutation(api.kodeProjectMoves.claimProjectMove, { id, deviceId: "x" })).rejects.toThrow();
	const claimed = await me.mutation(api.kodeProjectMoves.claimProjectMove, { id, deviceId: "mac-2" });
	expect(claimed?.patch).toBe("diff --git a/x b/x");
	expect(claimed?.chatIds).toEqual([mine]);
	expect(await me.mutation(api.kodeProjectMoves.claimProjectMove, { id, deviceId: "mac-3" })).toBeNull();
	await me.mutation(api.kodeProjectMoves.releaseProjectMove, { id });
	expect(await me.query(api.kodeProjectMoves.listProjectMoves, {})).toHaveLength(1);
});
