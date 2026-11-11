// Editor view preferences shared by every open editor (kept per device).

import { useSyncExternalStore } from "react";

export type EditorPrefs = {
  wordWrap: boolean;
  minimap: boolean;
  whitespace: boolean;
  problems: boolean;
};

const KEY = "kontinue.editor.prefs";
const DEFAULTS: EditorPrefs = { wordWrap: false, minimap: true, whitespace: false, problems: false };

function load(): EditorPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<EditorPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let prefs = load();
const listeners = new Set<() => void>();

export function getEditorPrefs() {
  return prefs;
}

export function setEditorPref<K extends keyof EditorPrefs>(key: K, value: EditorPrefs[K]) {
  if (prefs[key] === value) return;
  prefs = { ...prefs, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Applies for this session only.
  }
  for (const listener of listeners) listener();
}

export function useEditorPrefs(): EditorPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs,
  );
}
