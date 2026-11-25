// Annotations: notes pinned to selected text (a reply, a file) or to an
// element in the browser preview. They wait as chips in the composer and go
// out with your next message, then clear. Each belongs to the thread that was
// open when it was made (its composer's draft key), so a note doesn't follow
// you into another thread.

import { useMemo, useSyncExternalStore } from "react";

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

type Scoped = { scope: string; annotation: KodeAnnotation };

const EMPTY: Scoped[] = [];
let items: Scoped[] = EMPTY;
let currentScope = "default";
const listeners = new Set<() => void>();

function commit(next: Scoped[]) {
  items = next.length ? next : EMPTY;
  for (const listener of listeners) listener();
}

/** The thread in view (PlanView): new notes belong to it. */
export function setAnnotationScope(scope: string) {
  currentScope = scope;
}

/** The notes waiting in this thread's composer. */
export function useAnnotations(scope: string = currentScope): KodeAnnotation[] {
  const all = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
  );
  return useMemo(() => all.filter((item) => item.scope === scope).map((item) => item.annotation), [all, scope]);
}

export function addAnnotation(annotation: NewAnnotation) {
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  commit([...items, { scope: currentScope, annotation: { ...annotation, id } as KodeAnnotation }]);
}

export function removeAnnotation(id: string) {
  if (items.some((item) => item.annotation.id === id)) commit(items.filter((item) => item.annotation.id !== id));
}

/** Hand this thread's pending annotations to a send and clear them. */
export function takeAnnotations(scope: string = currentScope): KodeAnnotation[] {
  const taken = items.filter((item) => item.scope === scope);
  if (taken.length) commit(items.filter((item) => item.scope !== scope));
  return taken.map((item) => item.annotation);
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
