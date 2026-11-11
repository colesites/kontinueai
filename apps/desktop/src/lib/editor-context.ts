// What the user has open in the file editor, so the coding agent can see the
// active file and selection. The editor publishes; the chat reads it when a
// message is sent.

export type EditorSelection = {
  startLine: number;
  endLine: number;
  text: string;
};

export type EditorContext = {
  root: string;
  path: string;
  language: string;
  cursorLine: number;
  selection: EditorSelection | null;
  dirty: boolean;
  /** When the editor last had focus or changed selection. */
  at: number;
};

let current: EditorContext | null = null;

export function publishEditorContext(next: EditorContext) {
  current = next;
}

/** Clear the context when its editor closes. */
export function clearEditorContext(root: string, path: string) {
  if (current && current.root === root && current.path === path) current = null;
}

/** The active editor context for a project, if one was used recently. */
export function getEditorContext(root: string | null | undefined, maxAgeMs = 30 * 60_000): EditorContext | null {
  if (!root || !current || current.root !== root) return null;
  if (Date.now() - current.at > maxAgeMs) return null;
  return current;
}

const SELECTION_CHARS = 6_000;

// Editor language ids that differ from common code-fence names.
const FENCE: Record<string, string> = { typescriptreact: "tsx", plaintext: "", dotenv: "sh", ignore: "", "git-commit": "" };

/** The block added to the model's prompt. Empty when nothing is open. */
export function formatEditorContext(context: EditorContext | null): string {
  if (!context) return "";
  const state = context.dirty ? " (it has unsaved changes in the editor)" : "";
  const selection = context.selection;
  if (selection?.text.trim()) {
    const range = selection.startLine === selection.endLine ? `line ${selection.startLine}` : `lines ${selection.startLine}-${selection.endLine}`;
    const text = selection.text.length > SELECTION_CHARS ? `${selection.text.slice(0, SELECTION_CHARS)}\n…(selection truncated)` : selection.text;
    return `\n\n[Editor: the user has ${context.path} open${state} with ${range} selected:]\n\`\`\`${FENCE[context.language] ?? context.language}\n${text}\n\`\`\``;
  }
  return `\n\n[Editor: the user has ${context.path} open${state}, cursor on line ${context.cursorLine}.]`;
}
