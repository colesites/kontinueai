// The one place Monaco is loaded. Only the editor core, its features and the
// CSS/HTML/JSON/TypeScript language services are bundled; highlighting comes
// from TextMate grammars (./textmate.ts), not Monaco's Monarch definitions.
// This module is imported lazily, so none of it loads until a file is opened.

import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
// Parts of the full editor that `features/register.all` leaves out, notably
// go to definition / find references (goToCommands).
import "monaco-editor/editor/browser/coreCommands";
import "monaco-editor/editor/common/standaloneStrings";
import "monaco-editor/editor/contrib/caretOperations/browser/caretOperations";
import "monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution";
import "monaco-editor/editor/contrib/find/browser/findController";
import "monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus";
import "monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands";
import "monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens";
import "monaco-editor/editor/contrib/suggest/browser/suggestController";
import "./editor.css";
import * as typescript from "monaco-editor/languages/features/typescript/register";
import * as json from "monaco-editor/languages/features/json/register";
import * as css from "monaco-editor/languages/features/css/register";
import "monaco-editor/languages/features/html/register";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
// Monaco's TypeScript worker plus auto-import completions.
import TsWorker from "./ts.worker?worker";
import JsonWorker from "monaco-editor/languages/features/json/json.worker?worker";
import CssWorker from "monaco-editor/languages/features/css/css.worker?worker";
import HtmlWorker from "monaco-editor/languages/features/html/html.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
  }
}

// Workers are bundled with the app (Vite `?worker`), so the editor works
// offline and inside the Tauri webview.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "typescript":
      case "javascript":
        return new TsWorker();
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Use this bundled copy instead of @monaco-editor/react's default CDN load.
loader.config({ monaco });

export { monaco, typescript, json, css };
export type Monaco = typeof monaco;
