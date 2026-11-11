// One-time editor setup, run before the first editor mounts.

import { registerAutoImports } from "./auto-import";
import { monaco } from "./monaco";
import { configureLanguageServices } from "./services";
import { registerLanguageIds } from "./textmate";
import { applyTheme, followAppTheme } from "./themes";
import { initTypeScriptDefaults } from "./typescript-project";

type Opener = {
  root: string;
  open: (path: string, selection: monaco.IRange | monaco.IPosition | undefined) => void;
};

const openers = new Map<string, Opener>();

/** Route "go to definition" into another file to the Files panel that owns `editor`. */
export function registerEditorOpener(editor: monaco.editor.ICodeEditor, opener: Opener): () => void {
  const id = editor.getId();
  openers.set(id, opener);
  return () => {
    if (openers.get(id) === opener) openers.delete(id);
  };
}

/** Root-relative path for a file URI inside `root`, else null. */
export function projectPath(root: string, uri: monaco.Uri): string | null {
  if (uri.scheme !== "file") return null;
  const base = root.replace(/\/$/, "");
  return uri.path.startsWith(`${base}/`) ? uri.path.slice(base.length + 1) : null;
}

let ready: Promise<void> | null = null;

export function setupMonaco(): Promise<void> {
  ready ??= (async () => {
    registerLanguageIds();
    configureLanguageServices();
    initTypeScriptDefaults();
    registerAutoImports();
    monaco.editor.registerEditorOpener({
      openCodeEditor(source, resource, selectionOrPosition) {
        if (source.getModel()?.uri.toString() === resource.toString()) return false;
        const opener = openers.get(source.getId());
        const path = opener ? projectPath(opener.root, resource) : null;
        if (!opener || !path) return false;
        opener.open(path, selectionOrPosition);
        return true;
      },
    });
    await applyTheme();
    followAppTheme();
  })();
  return ready;
}
