import { describe, expect, test } from "bun:test";
import { eventToKeys, findConflicts, formatKeys, normalizeKeys, resolveBindings } from "./kode-keybindings";

const event = (key: string, code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("keybindings", () => {
  test("normalizes bindings", () => {
    expect(normalizeKeys("Shift+Cmd+K")).toBe("mod+shift+k");
    expect(normalizeKeys("ctrl+alt+p")).toBe("ctrl+alt+p");
    expect(normalizeKeys("mod+shift")).toBeNull();
  });

  test("turns events into bindings on mac and elsewhere", () => {
    expect(eventToKeys(event("@", "Digit2", { metaKey: true, shiftKey: true }), true)).toBe("mod+shift+2");
    expect(eventToKeys(event("j", "KeyJ", { ctrlKey: true }), false)).toBe("mod+j");
    expect(eventToKeys(event("j", "KeyJ", { ctrlKey: true }), true)).toBe("ctrl+j");
    expect(eventToKeys(event("Shift", "ShiftLeft", { shiftKey: true }), true)).toBeNull();
  });

  test("formats and finds conflicts", () => {
    expect(formatKeys("mod+shift+k", true)).toEqual(["⌘", "⇧", "K"]);
    expect(formatKeys("mod+,", false)).toEqual(["Ctrl", ","]);
    const bindings = resolveBindings({ "kode.newChat": "mod+j" });
    expect(findConflicts("kode.newChat", "mod+j", bindings)).toEqual(["app.panel"]);
    expect(findConflicts("kode.newChat", "", bindings)).toEqual([]);
  });
});
