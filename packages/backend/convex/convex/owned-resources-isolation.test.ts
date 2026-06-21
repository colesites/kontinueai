import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./files.ts": () => import("./files"),
	"./projects.ts": () => import("./projects"),
	"./tasks.ts": () => import("./tasks"),
};
const identity = (subject: string) => ({
	subject,
	issuer: "https://clerk.test",
	tokenIdentifier: `https://clerk.test|${subject}`,
});

async function setup() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
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
		const chatId = await ctx.db.insert("chats", {
			ownerId: userAId,
			title: "A chat",
			createdAt: now,
			updatedAt: now,
			source: { provider: "test", importedAt: now, importMethod: "manual" },
		});
		const messageId = await ctx.db.insert("messages", {
			ownerId: userAId,
			chatId,
			role: "user",
			content: "private",
			createdAt: now,
			order: 0,
		});
		const fileId = await ctx.db.insert("files", {
			ownerId: userAId,
			chatId,
			messageId,
			blobUrl: "https://blob.test/a",
			pathname: "a/private.pdf",
			filename: "private.pdf",
			contentType: "application/pdf",
			size: 10,
			fileType: "attachment",
			createdAt: now,
		});
		return { fileId, chatId, messageId };
	});
	return {
		t,
		asA: t.withIdentity(identity("user_a")),
		asB: t.withIdentity(identity("user_b")),
		...ids,
	};
}

describe("owned resource isolation", () => {
	test("ISO-002: user B cannot read or delete user A's file", async () => {
		const { t, asB, fileId, chatId, messageId } = await setup();
		await expect(asB.query(api.files.getFile, { fileId })).rejects.toThrow();
		expect(await asB.query(api.files.listByChat, { chatId })).toEqual([]);
		await expect(
			asB.query(api.files.listByMessage, { messageId }),
		).rejects.toThrow();
		expect(await asB.query(api.files.listMyFiles, {})).toEqual([]);
		await expect(
			asB.mutation(api.files.createFileRecord, {
				chatId,
				messageId,
				blobUrl: "https://blob.test/stolen",
				pathname: "stolen.pdf",
				filename: "stolen.pdf",
				contentType: "application/pdf",
				size: 10,
				fileType: "attachment",
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.files.deleteFileRecord, { fileId }),
		).rejects.toThrow();
		expect(await t.run((ctx) => ctx.db.get(fileId))).not.toBeNull();
	});

	test("ISO-003: user B cannot read or update user A's project", async () => {
		const { asA, asB, chatId } = await setup();
		const projectId = await asA.mutation(api.projects.createProject, {
			name: "A only",
		});
		await expect(
			asB.query(api.projects.getProject, { projectId }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.projects.updateProject, { projectId, name: "Stolen" }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.projects.setProjectArchived, {
				projectId,
				archived: true,
			}),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.projects.assignChatToProject, { chatId, projectId }),
		).rejects.toThrow();
		await expect(
			asB.query(api.projects.listProjectChats, { projectId }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.projects.deleteProject, { projectId }),
		).rejects.toThrow();
		expect((await asA.query(api.projects.getProject, { projectId })).name).toBe(
			"A only",
		);
	});

	test("ISO-004: user B cannot read or update user A's task", async () => {
		const { asA, asB } = await setup();
		const taskId = await asA.mutation(api.tasks.createTask, {
			title: "A private task",
		});
		await expect(asB.query(api.tasks.getTask, { taskId })).rejects.toThrow();
		await expect(
			asB.mutation(api.tasks.updateTask, { taskId, title: "Stolen" }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.tasks.toggleTaskComplete, { taskId }),
		).rejects.toThrow();
		await expect(
			asB.mutation(api.tasks.deleteTask, { taskId }),
		).rejects.toThrow();
		expect((await asA.query(api.tasks.getTask, { taskId }))?.title).toBe(
			"A private task",
		);
	});
});
