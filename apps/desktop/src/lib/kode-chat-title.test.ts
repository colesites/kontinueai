import { describe, expect, test } from "bun:test";
import { cleanTitle, needsDraftTitle, quickTitle } from "./kode-chat-title";

describe("quickTitle", () => {
  test("keeps a short message as is", () => {
    expect(quickTitle("Fix the terminal tabs")).toBe("Fix the terminal tabs");
    expect(needsDraftTitle("Fix the terminal tabs")).toBe(false);
  });

  test("takes the first sentence and cuts at a word, without an ellipsis", () => {
    const title = quickTitle(
      "I want to work on the desktop app. I noticed that I could not add antigravity & gemini acp/cli, is the problem from me or google?",
    );
    expect(title).toBe("I want to work on the desktop");
    expect(quickTitle("a ".repeat(60)).length).toBeLessThanOrEqual(32);
    expect(quickTitle("word ".repeat(30))).not.toContain("...");
  });

  test("an empty message is a new chat", () => {
    expect(quickTitle("   ")).toBe("New chat");
    expect(needsDraftTitle("")).toBe(false);
  });
});

describe("cleanTitle", () => {
  test("strips quotes, labels and trailing punctuation", () => {
    expect(cleanTitle('"Fix Google agent sign-in."')).toBe("Fix Google agent sign-in");
    expect(cleanTitle("Title: Desktop app fixes\nextra")).toBe("Desktop app fixes");
  });

  test("rejects empty or rambling answers", () => {
    expect(cleanTitle("")).toBeNull();
    expect(cleanTitle("x".repeat(80))).toBeNull();
  });
});
