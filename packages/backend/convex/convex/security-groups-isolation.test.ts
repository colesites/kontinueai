import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./imports.ts": () => import("./imports"),
	"./exports.ts": () => import("./exports"),
	"./notifications.ts": () => import("./notifications"),
	"./push.ts": () => import("./push"),
	"./connectors.ts": () => import("./connectors"),
	"./feedback.ts": () => import("./feedback"),
	"./kodeWeb.ts": () => import("./kodeWeb"),
	"./kode.ts": () => import("./kode"),
};
const identity = (subject: string) => ({
	subject,
	issuer: "https://clerk.test",
});

async function setup() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const now = Date.now();
		const userAId = await ctx.db.insert("users", {
			clerkUserId: "user_a",
			email: "a@example.test",
			plan: "pro_plan",
			createdAt: now,
		});
		await ctx.db.insert("users", {
			clerkUserId: "user_b",
			email: "b@example.test",
			plan: "pro_plan",
			createdAt: now,
		});
		const importJobId = await ctx.db.insert("importJobs", {
			ownerId: userAId,
			provider: "test",
			status: "queued",
			totalConversations: 1,
			processedConversations: 0,
			importedMessages: 0,
			totalChunks: 0,
			completedChunks: 0,
			progress: 0,
			createdAt: now,
			updatedAt: now,
		});
		const exportId = await ctx.db.insert("dataExports", {
			ownerId: userAId,
			format: "json",
			status: "processing",
			createdAt: now,
		});
		const notificationId = await ctx.db.insert("notifications", {
			ownerId: userAId,
			type: "system",
			title: "Private",
			read: false,
			createdAt: now,
		});
		const connectorId = await ctx.db.insert("connectors", {
			ownerId: userAId,
			provider: "github",
			accessTokenEncrypted: "secret-ciphertext",
			scopes: ["read"],
			connected: true,
			createdAt: now,
			updatedAt: now,
		});
		const pushId = await ctx.db.insert("pushSubscriptions", {
			ownerId: userAId,
			endpoint: "https://push.test/a",
			p256dh: "a-key",
			auth: "a-auth",
			createdAt: now,
		});
		const expoId = await ctx.db.insert("expoPushTokens", {
			ownerId: userAId,
			token: "ExponentPushToken[a]",
			createdAt: now,
			updatedAt: now,
		});
		const postId = await ctx.db.insert("feedbackPosts", {
			ownerId: userAId,
			title: "A post",
			details: "Private edit rights",
			type: "feature",
			score: 0,
			commentCount: 0,
			createdAt: now,
			updatedAt: now,
		});
		const kodeChatId = await ctx.db.insert("kodeChats", {
			ownerId: userAId,
			title: "A Kode chat",
			createdAt: now,
			updatedAt: now,
		});
		const kodeMessageId = await ctx.db.insert("kodeMessages", {
			ownerId: userAId,
			chatId: kodeChatId,
			role: "user",
			content: "private code",
			createdAt: now,
			order: 0,
		});
		return {
			importJobId,
			exportId,
			notificationId,
			connectorId,
			pushId,
			expoId,
			postId,
			kodeChatId,
			kodeMessageId,
		};
	});
	return {
		t,
		asA: t.withIdentity(identity("user_a")),
		asB: t.withIdentity(identity("user_b")),
		...ids,
	};
}

describe("remaining owned resource groups", () => {
	test("ISO-007: import and export jobs are owner-only", async () => {
		const { t, asB, importJobId, exportId } = await setup();
		expect(
			await asB.query(api.imports.getImportJob, { jobId: importJobId }),
		).toBeNull();
		await expect(
			asB.mutation(api.imports.cancelImport, { jobId: importJobId }),
		).rejects.toThrow();
		expect(await asB.query(api.exports.listExports, {})).toEqual([]);
		await expect(
			asB.mutation(api.exports.deleteExport, { exportId }),
		).rejects.toThrow();
		expect(await t.run((ctx) => ctx.db.get(exportId))).not.toBeNull();
	});

	test("ISO-008 and ISO-009: notifications and connector metadata stay isolated", async () => {
		const { t, asB, notificationId, connectorId, pushId, expoId } =
			await setup();
		expect(await asB.query(api.notifications.listNotifications, {})).toEqual(
			[],
		);
		await asB.mutation(api.notifications.markRead, { notificationId });
		expect((await t.run((ctx) => ctx.db.get(notificationId)))?.read).toBe(
			false,
		);
		expect(await asB.query(api.connectors.listConnectors, {})).toEqual([]);
		await asB.mutation(api.connectors.disconnect, { provider: "github" });
		expect(await t.run((ctx) => ctx.db.get(connectorId))).not.toBeNull();
		await expect(
			asB.mutation(api.push.savePushSubscription, {
				endpoint: "https://push.test/a",
				p256dh: "stolen",
				auth: "stolen",
			}),
		).rejects.toThrow();
		await asB.mutation(api.push.deletePushSubscription, {
			endpoint: "https://push.test/a",
		});
		expect((await t.run((ctx) => ctx.db.get(pushId)))?.ownerId).toBeDefined();
		await expect(
			asB.mutation(api.push.saveExpoPushToken, {
				token: "ExponentPushToken[a]",
			}),
		).rejects.toThrow();
		await asB.mutation(api.push.deleteExpoPushToken, {
			token: "ExponentPushToken[a]",
		});
		expect((await t.run((ctx) => ctx.db.get(expoId)))?.ownerId).toBeDefined();
	});

	test("ISO-010: feedback edits and deletes require ownership", async () => {
		const { asA, asB, postId } = await setup();
		await expect(
			asB.mutation(api.feedback.updatePost, {
				postId,
				title: "Stolen",
				details: "Unauthorized",
				type: "bug",
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.feedback.deletePost, { postId }),
		).rejects.toThrow();
		expect((await asA.query(api.feedback.listPosts, {}))[0]?.title).toBe(
			"A post",
		);
	});

	test("ISO-011: Kode projects and workspace data are owner-only", async () => {
		const { asA, asB, kodeChatId, kodeMessageId } = await setup();
		const projectId = await asA.mutation(api.kodeWeb.createProject, {
			prompt: "Build a private app",
		});
		expect(await asB.query(api.kodeWeb.getWorkspace, { projectId })).toBeNull();
		await expect(
			asB.mutation(api.kodeWeb.startBuild, {
				projectId,
				prompt: "Steal this app",
				mode: "build",
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.kodeWeb.updateFile, {
				projectId,
				path: "index.html",
				content: "stolen",
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.kodeWeb.renameProject, { projectId, title: "Stolen" }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.kodeWeb.toggleStar, { projectId }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.kodeWeb.deleteProject, { projectId }),
		).rejects.toThrow();
		expect(
			(await asA.query(api.kodeWeb.getWorkspace, { projectId }))?.project.title,
		).not.toBe("Stolen");
		expect(
			await asB.query(api.kode.getMessages, { chatId: kodeChatId }),
		).toEqual([]);
		await expect(
			asB.mutation(api.kode.addMessage, {
				chatId: kodeChatId,
				role: "user",
				content: "stolen",
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.kode.deleteMessagesAfter, {
				messageId: kodeMessageId,
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.kode.deleteChat, { chatId: kodeChatId }),
		).rejects.toThrow();
	});

	test("PLAN-005 and PLAN-008: Kode access is revoked after leaving Pro", async () => {
		const { t, asA } = await setup();
		const projectId = await asA.mutation(api.kodeWeb.createProject, {
			prompt: "Build before canceling",
		});
		await t.run(async (ctx) => {
			const user = await ctx.db
				.query("users")
				.withIndex("by_clerk_id", (q) => q.eq("clerkUserId", "user_a"))
				.unique();
			if (user) await ctx.db.patch(user._id, { plan: "starter_plan" });
		});
		expect(await asA.query(api.kodeWeb.listProjects, {})).toEqual([]);
		expect(await asA.query(api.kodeWeb.getWorkspace, { projectId })).toBeNull();
		await expect(
			asA.mutation(api.kodeWeb.deleteProject, { projectId }),
		).rejects.toThrow();
	});
});
