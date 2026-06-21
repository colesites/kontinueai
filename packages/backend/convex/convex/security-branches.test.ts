import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = {
  "./_generated/server.ts": () => import("./_generated/server"),
  "./users.ts": () => import("./users"),
  "./chats.ts": () => import("./chats"),
};

const identity = (subject: string) => ({
  subject,
  issuer: "https://clerk.test",
  tokenIdentifier: `https://clerk.test|${subject}`,
});

describe("Convex security branches", () => {
  test("missing authentication rejects user synchronization", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.getOrCreateUser, {
        email: "anonymous@example.test",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  test("server identity overrides attempts to supply another user ID", async () => {
    const t = convexTest(schema, modules);
    const asAttacker = t.withIdentity(identity("attacker"));
    const forgedArgs = {
      clerkUserId: "victim",
      email: "attacker@example.test",
    };
    await expect(
      asAttacker.mutation(api.users.getOrCreateUser, forgedArgs),
    ).rejects.toThrow("Unexpected field");

    await asAttacker.mutation(api.users.getOrCreateUser, {
      email: "attacker@example.test",
    });
    const current = await asAttacker.query(api.users.getCurrentUser, {});
    expect(current?.clerkUserId).toBe("attacker");
  });

  test("missing and foreign chats expose the same mutation error", async () => {
    const t = convexTest(schema, modules);
    const { foreignChatId, missingChatId } = await t.run(async (ctx) => {
      const now = Date.now();
      const ownerId = await ctx.db.insert("users", {
        clerkUserId: "owner",
        email: "owner@example.test",
        createdAt: now,
      });
      await ctx.db.insert("users", {
        clerkUserId: "attacker",
        email: "attacker@example.test",
        createdAt: now,
      });
      const foreignChatId = await ctx.db.insert("chats", {
        ownerId,
        title: "Private",
        createdAt: now,
        updatedAt: now,
        source: { provider: "test", importedAt: now, importMethod: "manual" },
      });
      const missingChatId = await ctx.db.insert("chats", {
        ownerId,
        title: "Deleted",
        createdAt: now,
        updatedAt: now,
        source: { provider: "test", importedAt: now, importMethod: "manual" },
      });
      await ctx.db.delete(missingChatId);
      return { foreignChatId, missingChatId };
    });
    const asAttacker = t.withIdentity(identity("attacker"));
    for (const chatId of [foreignChatId, missingChatId]) {
      await expect(
        asAttacker.mutation(api.chats.updateChatTitle, {
          chatId,
          title: "Probe",
        }),
      ).rejects.toThrow("Chat not found");
    }
  });
});
