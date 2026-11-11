import { describe, expect, test } from "bun:test";
import { checkShareUrl, importProgressFromTitle, startSharedImport } from "./home-import";

describe("checkShareUrl", () => {
  test("accepts links and rejects the rest", () => {
    expect(checkShareUrl(" https://chatgpt.com/share/abc ")).toEqual({ url: "https://chatgpt.com/share/abc" });
    expect(checkShareUrl("")).toHaveProperty("error");
    expect(checkShareUrl("not a link")).toHaveProperty("error");
    expect(checkShareUrl("ftp://x.com/a")).toHaveProperty("error");
  });
});

describe("importProgressFromTitle", () => {
  test("reads the progress the import writes into the title", () => {
    expect(importProgressFromTitle("Importing 42% · Fetching shared page")).toEqual({ percent: 42, stage: "Fetching shared page" });
    expect(importProgressFromTitle("Importing conversation...")).toEqual({ percent: 2, stage: "Starting" });
    expect(importProgressFromTitle("My chat")).toBeNull();
  });
});

describe("startSharedImport", () => {
  test("creates the chat first, then imports through the Convex action", async () => {
    const calls: string[] = [];
    const { chatId, done } = await startSharedImport("https://claude.ai/share/x", {
      createChat: async (args) => {
        calls.push(`create:${args.provider}:${args.title}`);
        return "chat1";
      },
      importViaFirecrawl: async ({ chatId: id }) => {
        calls.push(`firecrawl:${id}`);
        return { success: true };
      },
      appendImported: async () => calls.push("append"),
      appendFailure: async () => calls.push("fail"),
    });
    await done;
    expect(chatId).toBe("chat1");
    expect(calls).toEqual(["create:claude:Importing conversation...", "firecrawl:chat1"]);
  });

  test("a failed import leaves a failure note in the chat", async () => {
    const notes: string[] = [];
    const { done } = await startSharedImport("https://claude.ai/share/x", {
      createChat: async () => "chat1",
      importViaFirecrawl: async () => {
        throw new Error("page not found");
      },
      appendImported: async () => {},
      appendFailure: async ({ errorMessage }) => notes.push(errorMessage),
    });
    await done;
    expect(notes).toEqual(["page not found"]);
  });
});
