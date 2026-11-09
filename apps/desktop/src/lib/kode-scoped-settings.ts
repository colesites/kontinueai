// Settings scoped to a project or an environment.
//
// Layers, last wins:
//   global (Settings)  →  project (.kode/settings.json, can be committed and
//   shared with the team)  →  environment (this machine's overrides for the
//   folder, kept with the Edit environment dialog's variables).
// Only Kode session settings can be scoped; the rest stay global.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useSyncExternalStore } from "react";
import { getSettings, useAppSettings, type AppSettings } from "./app-settings";
import { getEnvironment, saveEnvironment } from "./kode-environments";

export const SCOPED_KEYS = [
  "defaultKodeModel",
  "defaultKodeMode",
  "kodeFastMode",
  "kodeReasoning",
  "kodeContextWindow",
  "sendOnEnter",
] as const;
export type ScopedKey = (typeof SCOPED_KEYS)[number];
export type ScopedSettings = Partial<Pick<AppSettings, ScopedKey>>;
export type SettingScope = "global" | "project" | "environment";

const MODES = ["supervised", "auto_edits", "auto", "full_access", "plan"];
const EFFORTS = ["off", "low", "medium", "high", "xhigh", "max"];

/** Keep only known keys with values of the right type. */
export function sanitizeScoped(raw: unknown): ScopedSettings {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof input.defaultKodeModel === "string" || input.defaultKodeModel === null) out.defaultKodeModel = input.defaultKodeModel;
  if (typeof input.defaultKodeMode === "string" && MODES.includes(input.defaultKodeMode)) out.defaultKodeMode = input.defaultKodeMode;
  if (typeof input.kodeFastMode === "boolean") out.kodeFastMode = input.kodeFastMode;
  if (typeof input.kodeReasoning === "string" && EFFORTS.includes(input.kodeReasoning)) out.kodeReasoning = input.kodeReasoning;
  if ((typeof input.kodeContextWindow === "number" && input.kodeContextWindow > 0) || input.kodeContextWindow === null) out.kodeContextWindow = input.kodeContextWindow;
  if (typeof input.sendOnEnter === "boolean") out.sendOnEnter = input.sendOnEnter;
  return out as ScopedSettings;
}

export function resolveScoped(global: AppSettings, project: ScopedSettings = {}, environment: ScopedSettings = {}): AppSettings {
  return { ...global, ...sanitizeScoped(project), ...sanitizeScoped(environment) };
}

/** Which layer a key's effective value comes from. */
export function scopeOf(key: ScopedKey, project: ScopedSettings = {}, environment: ScopedSettings = {}): SettingScope {
  if (key in environment) return "environment";
  if (key in project) return "project";
  return "global";
}

// Project files are read once per root and cached; edits write through.
const PROJECT_FILE = ".kode/settings.json";
const projectCache = new Map<string, ScopedSettings>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

export async function loadProjectSettings(root: string): Promise<ScopedSettings> {
  try {
    const text = await invoke<string>("kode_read_file", { root, path: PROJECT_FILE });
    const parsed = sanitizeScoped(JSON.parse(text));
    projectCache.set(root, parsed);
  } catch {
    projectCache.set(root, {});
  }
  notify();
  return projectCache.get(root) ?? {};
}

export async function saveProjectSettings(root: string, settings: ScopedSettings) {
  const clean = sanitizeScoped(settings);
  await invoke("kode_write_file", { root, path: PROJECT_FILE, content: `${JSON.stringify(clean, null, 2)}\n` });
  projectCache.set(root, clean);
  notify();
}

export function environmentSettings(root: string | null): ScopedSettings {
  return sanitizeScoped((getEnvironment(root) as { settings?: unknown }).settings);
}

export function saveEnvironmentSettings(root: string, settings: ScopedSettings) {
  const env = getEnvironment(root);
  saveEnvironment(root, { ...env, settings: sanitizeScoped(settings) } as typeof env);
  notify();
}

/** Effective settings for a project root, right now (no React). */
export function getScopedSettings(root: string | null): AppSettings {
  if (!root) return getSettings();
  return resolveScoped(getSettings(), projectCache.get(root), environmentSettings(root));
}

/** Effective settings for a project root; loads its .kode/settings.json. */
export function useScopedSettings(root: string | null): AppSettings {
  const global = useAppSettings();
  useEffect(() => {
    if (root && !projectCache.has(root)) void loadProjectSettings(root);
  }, [root]);
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  if (!root) return global;
  return resolveScoped(global, projectCache.get(root), environmentSettings(root));
}

export function projectSettings(root: string): ScopedSettings {
  return projectCache.get(root) ?? {};
}
