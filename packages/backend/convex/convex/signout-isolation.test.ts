import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
	"./_generated/server.ts": () => import("./_generated/server"),
	"./chats.ts": () => import("./chats"),
	"./messages.ts": () => import("./messages"),
	"./projects.ts": () => import("./projects"),
	"./tasks.ts": () => import("./tasks"),
	"./notifications.ts": () => import("./notifications"),
	"./connectors.ts": () => import("./connectors"),
};

describe("sign-out data isolation", () => {
	test("AUTH-005: dropping identity removes subscribed private data", async () => {
		const t = convexTest(schema, modules);
		const chatId = await t.run(async (ctx) => {
			const now = Date.now();
			const ownerId = await ctx.db.insert("users", {
				clerkUserId: "signed_out_user",
				email: "owner@example.test",
				createdAt: now,
			});
			return await ctx.db.insert("chats", {
				ownerId,
				title: "Stale secret",
				createdAt: now,
				updatedAt: now,
				source: { provider: "test", importedAt: now, importMethod: "manual" },
			});
		});

		expect(await t.query(api.chats.getUserChats, {})).toEqual([]);
		expect(await t.query(api.chats.getChat, { chatId })).toBeNull();
		expect(await t.query(api.messages.getMessages, { chatId })).toEqual([]);
		expect(await t.query(api.projects.listProjects, {})).toEqual([]);
		expect(await t.query(api.tasks.listTasks, {})).toEqual([]);
		expect(await t.query(api.notifications.listNotifications, {})).toEqual([]);
		expect(await t.query(api.connectors.listConnectors, {})).toEqual([]);
	});
});
