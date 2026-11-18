import { describe, expect, it } from "@jest/globals";

import { highlightCode } from "./code-highlight";

const typesOf = (code: string, language: string) =>
  highlightCode(code, language).filter((t) => t.type !== "plain");

describe("highlightCode", () => {
  it("colors TypeScript keywords, strings, calls and comments", () => {
    const tokens = typesOf('const name = greet("hi"); // done', "ts");
    expect(tokens).toEqual([
      { text: "const", type: "keyword" },
      { text: "greet", type: "function" },
      { text: '"hi"', type: "string" },
      { text: "// done", type: "comment" },
    ]);
  });

  it("handles Python comments and triple-quoted strings", () => {
    const tokens = typesOf('def f():\n    """doc"""\n    return None  # x', "python");
    expect(tokens.map((t) => t.type)).toEqual([
      "keyword",
      "function",
      "string",
      "keyword",
      "number",
      "comment",
    ]);
  });

  it("tells JSON keys from values", () => {
    const tokens = typesOf('{"a": "b", "n": 2, "ok": true}', "json");
    expect(tokens.map((t) => t.type)).toEqual([
      "attr",
      "string",
      "attr",
      "number",
      "attr",
      "keyword",
    ]);
  });

  it("keeps the original text intact", () => {
    const code = "<div class=\"x\">hi</div>\n";
    expect(highlightCode(code, "html").map((t) => t.text).join("")).toBe(code);
  });

  it("leaves unknown languages mostly plain", () => {
    expect(highlightCode("hello world", "brainfuck")).toEqual([
      { text: "hello world", type: "plain" },
    ]);
  });
});
