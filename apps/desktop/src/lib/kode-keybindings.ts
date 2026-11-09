// Configurable keybindings.
//
// A binding is a string like "mod+shift+k" ("mod" = ⌘ on macOS, Ctrl
// elsewhere). Defaults live here; the user's overrides are kept in
// localStorage. Components register a handler per command with
// `useKeybinding`, and one window listener dispatches to them.

import { useEffect, useRef, useSyncExternalStore } from "react";

export type KeybindingCommand = {
  id: string;
  label: string;
  group: "App" | "Kode";
  defaultKeys: string;
};

export const KEYBINDING_COMMANDS: KeybindingCommand[] = [
  { id: "app.settings", label: "Open or close settings", group: "App", defaultKeys: "mod+," },
  { id: "app.panel", label: "Toggle the workspace panel (Kode)", group: "App", defaultKeys: "mod+j" },
  { id: "kode.newChat", label: "New chat", group: "Kode", defaultKeys: "mod+shift+o" },
  { id: "kode.importSession", label: "Import a coding session", group: "Kode", defaultKeys: "mod+shift+i" },
  { id: "kode.snapshot", label: "Snapshot the screen into a new thread", group: "Kode", defaultKeys: "mod+shift+2" },
];

const STORAGE_KEY = "kode.keybindings";
const MODIFIERS = ["mod", "ctrl", "alt", "shift"] as const;

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Normalize "Shift+Mod+K" → "mod+shift+k". Returns null if it has no key. */
export function normalizeKeys(input: string): string | null {
  const parts = input
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part === "cmd" || part === "meta" || part === "⌘" ? "mod" : part === "option" || part === "⌥" ? "alt" : part === "control" ? "ctrl" : part));
  const key = parts.filter((part) => !(MODIFIERS as readonly string[]).includes(part));
  if (key.length !== 1) return null;
  const mods = MODIFIERS.filter((mod) => parts.includes(mod));
  return [...mods, key[0]].join("+");
}

/** The binding string for a keyboard event (null for a lone modifier). */
export function eventToKeys(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, mac = isMac): string | null {
  const key = event.key.toLowerCase();
  if (["meta", "control", "alt", "shift"].includes(key)) return null;
  // With Shift/Alt the produced character changes ("@" for 2); use the key code.
  let name = key;
  if (event.code?.startsWith("Digit")) name = event.code.slice(5);
  else if (event.code?.startsWith("Key")) name = event.code.slice(3).toLowerCase();
  else if (key === " ") name = "space";
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("mod");
  if (mac && event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(name);
  return parts.join("+");
}

/** "mod+shift+k" → ["⌘", "⇧", "K"] (or Ctrl / Shift on other systems). */
export function formatKeys(keys: string, mac = isMac): string[] {
  return keys.split("+").map((part) => {
    if (part === "mod") return mac ? "⌘" : "Ctrl";
    if (part === "ctrl") return mac ? "⌃" : "Ctrl";
    if (part === "alt") return mac ? "⌥" : "Alt";
    if (part === "shift") return mac ? "⇧" : "Shift";
    if (part === "space") return "Space";
    return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1);
  });
}

type Overrides = Record<string, string>;

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
}

let overrides: Overrides = load();
const listeners = new Set<() => void>();

function commit(next: Overrides) {
  overrides = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep in memory for this session.
  }
  for (const listener of listeners) listener();
}

/** command id → active keys ("" = unbound). */
export function resolveBindings(custom: Overrides = overrides): Record<string, string> {
  const out: Record<string, string> = {};
  for (const command of KEYBINDING_COMMANDS) out[command.id] = custom[command.id] ?? command.defaultKeys;
  return out;
}

/** Other commands already using `keys`. */
export function findConflicts(commandId: string, keys: string, bindings = resolveBindings()): string[] {
  if (!keys) return [];
  return Object.entries(bindings)
    .filter(([id, bound]) => id !== commandId && bound === keys)
    .map(([id]) => id);
}

export function setBinding(commandId: string, keys: string | null) {
  const next = { ...overrides };
  const command = KEYBINDING_COMMANDS.find((item) => item.id === commandId);
  if (keys === null || keys === command?.defaultKeys) delete next[commandId];
  else next[commandId] = keys;
  commit(next);
}

export function resetBindings() {
  commit({});
}

export function useBindings(): Record<string, string> {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => overrides,
  );
  return resolveBindings(snapshot);
}

// One listener dispatches to the registered handlers.
const handlers = new Map<string, Set<() => void>>();
let paused = 0;

/** While recording a new binding, shortcuts shouldn't fire. */
export function pauseKeybindings(pause: boolean) {
  paused = Math.max(0, paused + (pause ? 1 : -1));
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (event) => {
      if (paused) return;
      const keys = eventToKeys(event);
      if (!keys || !keys.includes("+")) return; // single keys stay with inputs
      const bindings = resolveBindings();
      for (const [id, bound] of Object.entries(bindings)) {
        if (bound !== keys) continue;
        const set = handlers.get(id);
        if (!set?.size) continue;
        event.preventDefault();
        for (const handler of set) handler();
        return;
      }
    },
    { capture: true },
  );
}

export function useKeybinding(commandId: string, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const run = () => ref.current();
    let set = handlers.get(commandId);
    if (!set) handlers.set(commandId, (set = new Set()));
    set.add(run);
    return () => {
      set.delete(run);
    };
  }, [commandId]);
}
