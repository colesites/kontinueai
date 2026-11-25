// Composer drafts per thread. The chat input stays mounted when you switch
// threads, so its text used to follow you into every thread. Each thread (and
// each project's "new thread" composer) now keeps its own draft: the text is
// kept across restarts, attachments for this session only (they can be big).

const STORAGE_KEY = "kode.drafts";
const MAX_SAVED = 100;
const MAX_TEXT = 50_000;

type Saved = Record<string, { text: string; at: number }>;

let saved: Saved = load();
const attachmentsByKey = new Map<string, unknown[]>();
const chipsByKey = new Map<string, unknown[]>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    // Keep the newest drafts only.
    const entries = Object.entries(saved).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_SAVED);
    saved = Object.fromEntries(entries);
    try {
      if (entries.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: drafts still work for this session.
    }
  }, 400);
}

export function getDraft<T>(key: string): { text: string; attachments: T[] } {
  return {
    text: saved[key]?.text ?? "",
    attachments: (attachmentsByKey.get(key) as T[] | undefined) ?? [],
  };
}

export function setDraft<T>(key: string, text: string, attachments: T[]) {
  if (attachments.length) attachmentsByKey.set(key, attachments);
  else attachmentsByKey.delete(key);
  const trimmed = text.slice(0, MAX_TEXT);
  if (trimmed.trim()) {
    if (saved[key]?.text === trimmed) return;
    saved = { ...saved, [key]: { text: trimmed, at: Date.now() } };
  } else {
    if (!(key in saved)) return;
    const { [key]: _gone, ...rest } = saved;
    saved = rest;
  }
  persist();
}

/** Picked command / skill / connector chips, per thread (this session only). */
export function getDraftChips<T>(key: string): T[] {
  return (chipsByKey.get(key) as T[] | undefined) ?? [];
}

export function setDraftChips<T>(key: string, chips: T[]) {
  if (chips.length) chipsByKey.set(key, chips);
  else chipsByKey.delete(key);
}
