// Annotations: notes pinned to selected text (a reply, a file) or to an
// element in the browser preview. They wait as chips in the composer and go
// out with your next message, then clear.

import { useSyncExternalStore } from "react";

export type KodeAnnotation =
  | {
      id: string;
      kind: "text";
      /** Where the text came from, e.g. "File src/app.ts" or "Reply from Claude Opus". */
      source: string;
      quote: string;
      note: string;
    }
  | {
      id: string;
      kind: "element";
      url: string;
      /** CSS selector path to the element. */
      selector: string;
      /** Short description: tag, id/classes, visible text. */
      label: string;
      /** Trimmed outer HTML for context. */
      html: string;
      note: string;
    };

type NewAnnotation =
  | Omit<Extract<KodeAnnotation, { kind: "text" }>, "id">
  | Omit<Extract<KodeAnnotation, { kind: "element" }>, "id">;

const EMPTY: KodeAnnotation[] = [];
let items: KodeAnnotation[] = EMPTY;
const listeners = new Set<() => void>();

function commit(next: KodeAnnotation[]) {
  items = next.length ? next : EMPTY;
  for (const listener of listeners) listener();
}

export function useAnnotations(): KodeAnnotation[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
  );
}

export function addAnnotation(annotation: NewAnnotation) {
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  commit([...items, { ...annotation, id } as KodeAnnotation]);
}

export function removeAnnotation(id: string) {
  if (items.some((item) => item.id === id)) commit(items.filter((item) => item.id !== id));
}

/** Hand the pending annotations to a send and clear them. */
export function takeAnnotations(): KodeAnnotation[] {
  const taken = items;
  if (taken.length) commit([]);
  return taken;
}

const QUOTE_CHARS = 1_200;
const HTML_CHARS = 600;

function clip(text: string, max: number) {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** The block added to the model's prompt. */
export function formatAnnotations(annotations: KodeAnnotation[]): string {
  if (annotations.length === 0) return "";
  const blocks = annotations.map((a, i) => {
    const note = a.note.trim() || "(no note)";
    if (a.kind === "text") {
      const quote = clip(a.quote, QUOTE_CHARS)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return `${i + 1}. ${a.source}:\n${quote}\nNote: ${note}`;
    }
    return `${i + 1}. Element on ${a.url}\nSelector: ${a.selector}\nElement: ${a.label}\nHTML: ${clip(a.html, HTML_CHARS)}\nNote: ${note}`;
  });
  return `\n\n[The user annotated these. Address each note.]\n\n${blocks.join("\n\n")}`;
}

/** Short chip label. */
export function annotationTitle(a: KodeAnnotation): string {
  const text = a.kind === "text" ? `“${a.quote.replace(/\s+/g, " ").trim()}”` : a.label;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}
