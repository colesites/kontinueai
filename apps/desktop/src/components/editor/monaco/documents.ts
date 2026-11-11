// Open files, shared by every editor that shows them (the side panel and a
// full tab can show the same file). A document owns one Monaco model whose
// text is the draft, so typing never goes through React state.
//
// Files are read and written with the same Rust commands as the coding
// agent, and checked against disk so the agent's edits (and any other
// program's) show up: a clean file reloads in place (undoable), a file with
// unsaved changes asks whether to reload or keep yours.

import { invoke } from "@tauri-apps/api/core";
import { errorText, readFile, writeFile } from "@/components/panel/panel-api";
import { onProjectFileChange } from "@/lib/project-file-events";
import { monaco } from "./monaco";
import { detectLanguage } from "./languages";
import { ensureLanguage } from "./textmate";
import { fileUri, updateProjectSource } from "./typescript-project";

type Stamp = { mtime_ms: number; size: number };

export type DocumentState = {
  status: "loading" | "ready" | "error";
  error: string | null;
  saveError: string | null;
  language: string;
  dirty: boolean;
  saving: boolean;
  /** Bumped after each successful save, for the "Saved" flash. */
  savedTick: number;
  /** Changed on disk while you have unsaved changes. */
  conflict: boolean;
  /** Removed on disk; saving writes it again. */
  deleted: boolean;
  /** Reloaded from disk because something else changed it. */
  reloadedTick: number;
};

const MAX_BYTES = 40 * 1024 * 1024;

export class ProjectDocument {
  readonly key: string;
  readonly uri: monaco.Uri;
  model: monaco.editor.ITextModel | null = null;
  viewState: monaco.editor.ICodeEditorViewState | null = null;
  state: DocumentState;
  refs = 0;
  private savedVersion = 0;
  private stamp: Stamp | null = null;
  private listeners = new Set<() => void>();
  private disposables: monaco.IDisposable[] = [];
  private checking = false;
  private ownsModel = false;
  /** A position to reveal once an editor shows this document. */
  pendingReveal: monaco.IRange | monaco.IPosition | null = null;

  constructor(
    readonly root: string,
    readonly path: string,
  ) {
    this.key = `${root}\u0000${path}`;
    this.uri = fileUri(root, path);
    this.state = {
      status: "loading",
      error: null,
      saveError: null,
      language: detectLanguage(path),
      dirty: false,
      saving: false,
      savedTick: 0,
      conflict: false,
      deleted: false,
      reloadedTick: 0,
    };
    void this.load();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<DocumentState>) {
    const next = { ...this.state, ...patch };
    const keys = Object.keys(patch) as Array<keyof DocumentState>;
    if (keys.every((key) => next[key] === this.state[key])) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private async stat(): Promise<Stamp | null> {
    return invoke<Stamp | null>("editor_file_stat", { root: this.root, path: this.path });
  }

  private async load() {
    try {
      const stamp = await this.stat();
      if (!stamp) throw new Error("This file no longer exists.");
      if (stamp.size > MAX_BYTES) {
        throw new Error(`This file is ${(stamp.size / 1024 / 1024).toFixed(0)} MB, too large to edit here.`);
      }
      const text = await readFile(this.root, this.path).catch((error) => {
        const message = errorText(error);
        throw new Error(/utf-8|utf8|invalid data/i.test(message) ? "This file isn't text, so it can't be edited here." : message);
      });
      const language = detectLanguage(this.path, text.slice(0, 200).split("\n", 1)[0]);
      // Huge files skip TextMate tokenizing; Monaco stays fast on them.
      const tooBig = text.length > 8 * 1024 * 1024;
      const languageId = tooBig ? "plaintext" : language;
      if (!tooBig) await ensureLanguage(languageId);
      if (this.disposed) return;
      // The TypeScript service may have made a read-only copy for "peek".
      let model = monaco.editor.getModel(this.uri);
      if (model) {
        if (model.getValue() !== text) model.setValue(text);
        if (model.getLanguageId() !== languageId) monaco.editor.setModelLanguage(model, languageId);
      } else {
        model = monaco.editor.createModel(text, languageId, this.uri);
        this.ownsModel = true;
      }
      this.model = model;
      this.stamp = stamp;
      this.savedVersion = model.getAlternativeVersionId();
      this.disposables.push(
        model.onDidChangeContent(() => this.set({ dirty: this.isDirty() })),
        model.onWillDispose(() => {
          if (this.model === model) this.model = null;
        }),
      );
      this.set({ status: "ready", language: languageId, error: null, dirty: false });
    } catch (error) {
      this.set({ status: "error", error: errorText(error) });
    }
  }

  private isDirty() {
    return !!this.model && this.model.getAlternativeVersionId() !== this.savedVersion;
  }

  async save(): Promise<boolean> {
    const model = this.model;
    if (!model || this.state.saving) return false;
    if (!this.isDirty() && !this.state.deleted && !this.state.conflict) return true;
    const version = model.getAlternativeVersionId();
    const text = model.getValue();
    this.set({ saving: true, saveError: null });
    try {
      await writeFile(this.root, this.path, text);
      this.savedVersion = version;
      this.stamp = await this.stat().catch(() => null);
      updateProjectSource(this.root, this.path, text);
      this.set({
        saving: false,
        dirty: this.isDirty(),
        conflict: false,
        deleted: false,
        savedTick: this.state.savedTick + 1,
      });
      return true;
    } catch (error) {
      this.set({ saving: false, saveError: errorText(error) });
      return false;
    }
  }

  /** Compare with disk and pick up outside changes. */
  async checkDisk(force = false) {
    if (!this.model || this.checking || this.state.saving) return;
    this.checking = true;
    try {
      const stamp = await this.stat().catch(() => undefined);
      if (stamp === undefined) return;
      if (!stamp) {
        if (!this.state.deleted) {
          this.stamp = null;
          updateProjectSource(this.root, this.path, null);
          this.set({ deleted: true });
        }
        return;
      }
      const changed = force || !this.stamp || stamp.mtime_ms !== this.stamp.mtime_ms || stamp.size !== this.stamp.size;
      if (!changed && !this.state.deleted) return;
      if (stamp.size > MAX_BYTES) return;
      const text = await readFile(this.root, this.path).catch(() => null);
      if (text === null || !this.model) return;
      this.stamp = stamp;
      updateProjectSource(this.root, this.path, text);
      const current = this.model.getValue();
      if (text === current) {
        // Same as what's in the editor: nothing left to save.
        this.savedVersion = this.model.getAlternativeVersionId();
        this.set({ deleted: false, conflict: false, dirty: false });
        return;
      }
      if (this.isDirty()) {
        this.set({ deleted: false, conflict: true });
        return;
      }
      this.applyText(text);
      this.set({ deleted: false, conflict: false, dirty: false, reloadedTick: this.state.reloadedTick + 1 });
    } finally {
      this.checking = false;
    }
  }

  /** Replace the text with the smallest single edit, so cursors and undo survive. */
  private applyText(text: string) {
    const model = this.model;
    if (!model) return;
    const current = model.getValue();
    let start = 0;
    const max = Math.min(current.length, text.length);
    while (start < max && current.charCodeAt(start) === text.charCodeAt(start)) start++;
    let endCurrent = current.length;
    let endText = text.length;
    while (endCurrent > start && endText > start && current.charCodeAt(endCurrent - 1) === text.charCodeAt(endText - 1)) {
      endCurrent--;
      endText--;
    }
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(endCurrent);
    model.pushStackElement();
    model.pushEditOperations(
      [],
      [{ range: monaco.Range.fromPositions(from, to), text: text.slice(start, endText), forceMoveMarkers: true }],
      () => null,
    );
    model.pushStackElement();
    this.savedVersion = model.getAlternativeVersionId();
  }

  /** Conflict: take the version on disk. */
  async reloadFromDisk() {
    const text = await readFile(this.root, this.path).catch(() => null);
    if (text === null || !this.model) return;
    this.applyText(text);
    this.stamp = await this.stat().catch(() => null);
    this.set({ conflict: false, deleted: false, dirty: false });
  }

  /** Conflict: keep the editor's text; the next save overwrites disk. */
  keepMine() {
    this.set({ conflict: false });
  }

  private disposed = false;

  dispose() {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    if (this.model && this.ownsModel && !this.model.isDisposed()) this.model.dispose();
    this.model = null;
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Registry

const documents = new Map<string, ProjectDocument>();
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState>();

export function acquireDocument(root: string, path: string): ProjectDocument {
  const key = `${root}\u0000${path}`;
  let doc = documents.get(key);
  if (!doc) {
    doc = new ProjectDocument(root, path);
    doc.viewState = viewStates.get(key) ?? null;
    documents.set(key, doc);
  }
  doc.refs++;
  startWatching();
  return doc;
}

export function releaseDocument(doc: ProjectDocument) {
  doc.refs--;
  // Let a remount in the same tick (tab moved, StrictMode) reuse it.
  window.setTimeout(() => {
    if (doc.refs > 0 || documents.get(doc.key) !== doc) return;
    if (doc.viewState) viewStates.set(doc.key, doc.viewState);
    documents.delete(doc.key);
    doc.dispose();
  }, 0);
}

export function findDocument(root: string, path: string): ProjectDocument | undefined {
  return documents.get(`${root}\u0000${path}`);
}

/** Show `range` in the file once an editor has it open. */
export function requestReveal(root: string, path: string, range: monaco.IRange | monaco.IPosition) {
  const doc = findDocument(root, path);
  if (doc) {
    doc.pendingReveal = range;
    for (const listener of revealListeners) listener(doc);
  } else pendingReveals.set(`${root}\u0000${path}`, range);
}

const pendingReveals = new Map<string, monaco.IRange | monaco.IPosition>();
const revealListeners = new Set<(doc: ProjectDocument) => void>();

export function takeReveal(doc: ProjectDocument): monaco.IRange | monaco.IPosition | null {
  const queued = pendingReveals.get(doc.key);
  if (queued) {
    pendingReveals.delete(doc.key);
    return queued;
  }
  const reveal = doc.pendingReveal;
  doc.pendingReveal = null;
  return reveal;
}

export function onRevealRequest(listener: (doc: ProjectDocument) => void) {
  revealListeners.add(listener);
  return () => {
    revealListeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Disk watching: Kode's own tools announce writes; everything else (Claude
// Code, Codex, git, other editors) is caught by a light poll of open files.

let watching = false;
const POLL_MS = 1500;

function checkAll() {
  for (const doc of documents.values()) if (doc.refs > 0) void doc.checkDisk();
}

function startWatching() {
  if (watching) return;
  watching = true;
  onProjectFileChange((change) => {
    const doc = findDocument(change.root, change.path);
    if (doc) void doc.checkDisk(true);
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") checkAll();
  }, POLL_MS);
  window.addEventListener("focus", checkAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkAll();
  });
}
