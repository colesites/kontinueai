import { describe, expect, test } from "bun:test";
import { artifactDocument, diffLineKind, hasRichBlocks, splitRichBlocks } from "./kode-rich-blocks";

describe("rich blocks", () => {
  test("splits markdown, tool cards, images and artifacts", () => {
    const text = [
      "Intro",
      "```kode-tool",
      JSON.stringify({ name: "Edit", summary: "a.ts", detail: "+ x" }),
      "```",
      "Middle",
      "```kode-image",
      JSON.stringify({ path: ".kode/attachments/1.png", mediaType: "image/png" }),
      "```",
      "```kode-artifact",
      "<title>Sales</title><div id=c></div>",
      "```",
      "End",
    ].join("\n");
    expect(hasRichBlocks(text)).toBe(true);
    const segments = splitRichBlocks(text);
    expect(segments.map((s) => s.type)).toEqual(["markdown", "tool", "markdown", "image", "artifact", "markdown"]);
    expect(segments[4]).toMatchObject({ title: "Sales" });
  });

  test("leaves unfinished and malformed blocks as text", () => {
    expect(splitRichBlocks("a\n```kode-artifact\n<div>").map((s) => s.type)).toEqual(["markdown"]);
    expect(splitRichBlocks("```kode-tool\nnot json\n```")[0].type).toBe("markdown");
    expect(hasRichBlocks("no fences here")).toBe(false);
  });

  test("diff lines and the artifact document", () => {
    expect(["--- a", "+ b", "- c", "  d"].map(diffLineKind)).toEqual(["meta", "add", "remove", "context"]);
    const doc = artifactDocument("<p>x</p>", "dark", "f1");
    expect(doc).toContain("color-scheme:dark");
    expect(doc).toContain('"f1"');
    expect(artifactDocument("<html><head></head><body>y</body></html>", "light", "f2")).toContain("<head><meta charset");
  });
});

test("splitting a 400-turn imported chat with tool cards is fast", () => {
  const card = "```kode-tool\n" + JSON.stringify({ name: "Bash", summary: "bun test", detail: "x".repeat(3000), output: "y".repeat(1500) }) + "\n```";
  const turns = Array.from({ length: 400 }, (_, i) => `Turn ${i} ${"text ".repeat(400)}\n\n${Array(10).fill(card).join("\n\n")}`);
  const started = performance.now();
  let blocks = 0;
  for (const turn of turns) blocks += splitRichBlocks(turn).length;
  expect(blocks).toBe(400 * 11);
  expect(performance.now() - started).toBeLessThan(1500);
});

test("plain code fences become code blocks; shell ones are runnable", async () => {
  const { isShellLanguage, runnableCommand } = await import("./kode-rich-blocks");
  const segments = splitRichBlocks("Start it with:\n```bash\n$ bun run --cwd apps/web dev\n```\nThen:\n```ts\nconst a = 1;\n```\n```mermaid\ngraph TD\n```");
  expect(segments.map((s) => s.type)).toEqual(["markdown", "code", "markdown", "code", "markdown"]);
  expect(segments[1]).toMatchObject({ lang: "bash", complete: true });
  expect(isShellLanguage("bash")).toBe(true);
  expect(isShellLanguage("ts")).toBe(false);
  expect(runnableCommand("# start\n$ bun dev\n")).toBe("bun dev");
  // A fence still streaming shows as an unfinished code block.
  const streaming = splitRichBlocks("Run:\n```bash\nbun ins");
  expect(streaming.at(-1)).toMatchObject({ type: "code", complete: false, code: "bun ins" });
  // Fences indented inside list items stay with Markdown.
  expect(splitRichBlocks("- step\n  ```bash\n  ls\n  ```").map((s) => s.type)).toEqual(["markdown"]);
});
