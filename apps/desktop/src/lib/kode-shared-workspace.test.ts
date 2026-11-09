import { expect, test } from "bun:test";
import { mergeWorkspaces } from "./kode-shared-workspace";

test("merges project lists by path and remaps chat folders", () => {
  const local = {
    folders: [{ id: "f1", name: "web", path: "/code/web" }],
    chatFolder: { chatA: "f1" },
  };
  const shared = {
    folders: [
      { id: "x9", name: "web", path: "/code/web/" },
      { id: "f1", name: "api", path: "/code/api" },
    ],
    chatFolder: { chatB: "x9", chatC: "f1", chatA: "f1" },
  };
  const merged = mergeWorkspaces(local, shared);
  expect(merged.folders.map((f) => f.path)).toEqual(["/code/web", "/code/api"]);
  const api = merged.folders[1];
  expect(api.id).not.toBe("f1"); // id clash renamed
  expect(merged.chatFolder).toEqual({ chatA: "f1", chatB: "f1", chatC: api.id });
});
