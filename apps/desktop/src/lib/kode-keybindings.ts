// Configurable keybindings.
//
// A binding is a string like "mod+shift+k" ("mod" = ⌘ on macOS, Ctrl
// elsewhere). Defaults live here; the user's overrides are kept in
// localStorage. Components register a handler per command with
// `useKeybinding`, and one window listener dispatches to them.

import { useEffect, useRef, useSyncExternalStore } from "react";

export type KeybindingGroup = "App" | "Navigation" | "Threads" | "Kode" | "Composer" | "Usage" | "Appearance";
export const KEYBINDING_GROUPS: KeybindingGroup[] = ["App", "Navigation", "Threads", "Kode", "Composer", "Usage", "Appearance"];

export type KeybindingCommand = {
  id: string;
  label: string;
  group: KeybindingGroup;
  defaultKeys: string;
  /** Where it works, shown in Settings. */
  when: string;
  /** Leave the keys to the code editor and terminal when they have focus. */
  notInEditor?: boolean;
};

export const KEYBINDING_COMMANDS: KeybindingCommand[] = [
  { id: "app.commandPalette", label: "Command palette", group: "App", defaultKeys: "mod+k", when: "Always" },
  { id: "app.settings", label: "Open or close settings", group: "App", defaultKeys: "mod+,", when: "Always" },
  { id: "app.sidebar", label: "Toggle the sidebar", group: "App", defaultKeys: "mod+b", when: "Always" },
  { id: "app.panel", label: "Toggle the workspace panel", group: "App", defaultKeys: "mod+j", when: "In Kode" },
  { id: "kode.newChat", label: "New chat", group: "Kode", defaultKeys: "mod+shift+o", when: "In Kode" },
  { id: "kode.importSession", label: "Import a coding session", group: "Kode", defaultKeys: "mod+shift+i", when: "In Kode" },
  { id: "kode.snapshot", label: "Snapshot the screen into a new thread", group: "Kode", defaultKeys: "mod+shift+2", when: "In Kode, with Snapshots on" },
  { id: "kode.reopenTab", label: "Reopen closed tab", group: "Kode", defaultKeys: "mod+shift+t", when: "In Kode" },
  { id: "nav.back", label: "Back", group: "Navigation", defaultKeys: "mod+[", when: "Not in the editor or terminal", notInEditor: true },
  { id: "nav.forward", label: "Forward", group: "Navigation", defaultKeys: "mod+]", when: "Not in the editor or terminal", notInEditor: true },
  { id: "thread.next", label: "Next thread", group: "Threads", defaultKeys: "mod+shift+]", when: "Always" },
  { id: "thread.previous", label: "Previous thread", group: "Threads", defaultKeys: "mod+shift+[", when: "Always" },
  { id: "thread.pin", label: "Pin or unpin thread", group: "Threads", defaultKeys: "mod+shift+p", when: "A thread is open" },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `thread.jump${i + 1}`,
    label: `Jump to thread ${i + 1}`,
    group: "Threads" as const,
    defaultKeys: `mod+${i + 1}`,
    when: "Always",
  })),
  { id: "composer.modelPicker", label: "Open the model picker", group: "Composer", defaultKeys: "mod+shift+m", when: "Composer visible" },
  { id: "usage.open", label: "Open usage", group: "Usage", defaultKeys: "mod+u", when: "Always" },
  { id: "appearance.cycle", label: "Cycle theme (System, Light, Dark)", group: "Appearance", defaultKeys: "mod+alt+shift+a", when: "Always" },
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

// Punctuation keys by physical key, so Shift doesn't change them ("}" → "]").
const CODE_KEYS: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
};

/** The binding string for a keyboard event (null for a lone modifier). */
export function eventToKeys(event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, mac = isMac): string | null {
  const key = event.key.toLowerCase();
  if (["meta", "control", "alt", "shift"].includes(key)) return null;
  // With Shift/Alt the produced character changes ("@" for 2); use the key code.
  let name = key;
  if (event.code?.startsWith("Digit")) name = event.code.slice(5);
  else if (event.code?.startsWith("Key")) name = event.code.slice(3).toLowerCase();
  else if (event.code && CODE_KEYS[event.code]) name = CODE_KEYS[event.code];
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

/** When each command last ran from the keyboard (see `ranFromKeyboard`). */
const lastKeyRun = new Map<string, number>();
const pauseListeners = new Set<(paused: boolean) => void>();

/** While recording a new binding, shortcuts shouldn't fire. */
export function pauseKeybindings(pause: boolean) {
  const was = paused > 0;
  paused = Math.max(0, paused + (pause ? 1 : -1));
  if (was !== paused > 0) for (const listener of pauseListeners) listener(paused > 0);
}

/** The native menu drops its shortcuts while one is being recorded. */
export function onKeybindingsPaused(listener: (paused: boolean) => void) {
  pauseListeners.add(listener);
  return () => pauseListeners.delete(listener);
}

/** True when a shortcut just ran this command, so the matching menu event is the same key press. */
export function ranFromKeyboard(commandId: string) {
  return Date.now() - (lastKeyRun.get(commandId) ?? 0) < 400;
}

export function subscribeBindings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
        const command = KEYBINDING_COMMANDS.find((c) => c.id === id);
        if (command?.notInEditor && event.target instanceof Element && event.target.closest(".monaco-editor, .xterm")) return;
        event.preventDefault();
        lastKeyRun.set(id, Date.now());
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

/** Is anything listening for this command right now? (command palette) */
export function hasCommandHandler(commandId: string): boolean {
  return (handlers.get(commandId)?.size ?? 0) > 0;
}

/** Run a command as if its shortcut was pressed (command palette). */
export function runCommand(commandId: string) {
  for (const handler of handlers.get(commandId) ?? []) handler();
}
