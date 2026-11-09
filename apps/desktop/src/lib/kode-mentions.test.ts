import { expect, test } from "bun:test";
import { mentionEntries } from "./kode-mentions";

const files = [
  "README.md",
  "package.json",
  "src/app.tsx",
  "src/components/Button.tsx",
  "src/components/Card.tsx",
  "docs/guide.md",
];

const names = (query: string) =>
  mentionEntries(files, query).map((e) => `${e.isDir ? "dir:" : ""}${e.path}`);

test("root shows folders first, then files", () => {
  expect(names("")).toEqual(["dir:docs", "dir:src", "package.json", "README.md"]);
});

test("a folder path lists its children", () => {
  expect(names("src/")).toEqual(["dir:src/components", "src/app.tsx"]);
  expect(names("src/components/C")).toEqual(["src/components/Card.tsx"]);
});

test("a name searches root then deeper files", () => {
  expect(names("button")).toEqual(["src/components/Button.tsx"]);
  expect(names("gui")).toEqual(["docs/guide.md"]);
  expect(names("do")).toEqual(["dir:docs"]);
});
