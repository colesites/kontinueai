// Per-project environment settings (Edit environment dialog): a display name
// and environment variables applied to Kode terminals and agent commands.
import { useSyncExternalStore } from "react";

export type EnvVariable = { name: string; value: string };
export type KodeEnvironment = { name?: string; variables: EnvVariable[] };

const KEY = "kontinue.kode.environments";
let store: Record<string, KodeEnvironment> = load();
const listeners = new Set<() => void>();

function load(): Record<string, KodeEnvironment> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, KodeEnvironment>;
  } catch {
    return {};
  }
}

// Shared empty value: useSyncExternalStore needs the same object back on every
// read, or React re-renders forever.
const EMPTY_ENVIRONMENT: KodeEnvironment = Object.freeze({ variables: [] }) as KodeEnvironment;

export function getEnvironment(path: string | null): KodeEnvironment {
  return (path && store[path]) || EMPTY_ENVIRONMENT;
}

export function saveEnvironment(path: string, env: KodeEnvironment) {
  store = { ...store, [path]: env };
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable: applies for this session only.
  }
  for (const listener of listeners) listener();
}

/** NAME → value map for Rust commands (empty names skipped). */
export function envVarsFor(path: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of getEnvironment(path).variables) {
    if (v.name.trim()) out[v.name.trim()] = v.value;
  }
  return out;
}

export function useEnvironment(path: string | null): KodeEnvironment {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => getEnvironment(path),
    () => getEnvironment(path),
  );
}
