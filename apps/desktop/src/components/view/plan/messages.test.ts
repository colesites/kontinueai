import { describe, expect, test } from "bun:test";
import { isImportedTerminalDump } from "./messages";

describe("isImportedTerminalDump", () => {
  test("an imported background-command dump is one", () => {
    expect(isImportedTerminalDump("toolu_01abc Background command `bun dev` (exit code 0)")).toBe(true);
  });

  test("a Kode reply with saved steps that mention an exit code is not", () => {
    const reply = '```kode-steps\n[{"id":"toolu_01abc","name":"Bash","description":"Ran tsc","state":"done","result":"exit code 0"}]\n```\n\nAll checks pass.';
    expect(isImportedTerminalDump(reply)).toBe(false);
  });
});
