import { describe, expect, test } from "bun:test";
import { forgetChatPrefs, getChatPrefs, moveChatPrefs, setChatPrefs } from "./kode-chat-prefs";

describe("chat prefs", () => {
  test("each chat keeps its own settings", () => {
    setChatPrefs("a", { modelId: "m1", reasoning: "low" });
    setChatPrefs("b", { modelId: "m2" });
    expect(getChatPrefs("a")).toEqual({ modelId: "m1", reasoning: "low" });
    expect(getChatPrefs("b").modelId).toBe("m2");
    setChatPrefs("a", { mode: "plan" });
    expect(getChatPrefs("a")).toEqual({ modelId: "m1", reasoning: "low", mode: "plan" });
  });

  test("a draft hands its settings to the new chat and starts fresh", () => {
    setChatPrefs("draft", { modelId: "m3", root: "/p" });
    moveChatPrefs("draft", "c1");
    expect(getChatPrefs("c1")).toEqual({ modelId: "m3" });
    expect(getChatPrefs("draft")).toEqual({});
  });

  test("unknown chats have no settings (defaults apply)", () => {
    forgetChatPrefs("a");
    expect(getChatPrefs("a")).toEqual({});
    expect(getChatPrefs("never")).toEqual({});
  });
});
