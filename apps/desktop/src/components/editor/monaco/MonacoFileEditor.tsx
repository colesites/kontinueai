// The file editor: a Monaco editor on a shared project document, with the
// Files panel's header (path, save state), conflict notices when a file
// changes on disk, and an optional Problems list.

import { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Editor from "@monaco-editor/react";
import { AlertCircle, AlertTriangle, Check, Info, Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addAnnotation } from "@/lib/kode-annotations";
import { registerAnnotationSource } from "@/lib/annotation-sources";
import { clearEditorContext, publishEditorContext } from "@/lib/editor-context";
import { isMac } from "@/lib/kode-keybindings";
import { monaco } from "./monaco";
import { acquireDocument, onRevealRequest, releaseDocument, requestReveal, takeReveal, type DocumentState, type ProjectDocument } from "./documents";
import { languageDef } from "./languages";
import { getEditorPrefs, setEditorPref, useEditorPrefs } from "./prefs";
import { registerEditorOpener, setupMonaco } from "./setup";
import { useThemeName } from "./themes";
import { ensureTypeScriptProject, isScriptLanguage } from "./typescript-project";

export type FileEditorProps = {
  root: string;
  path: string;
  onOpenInTab?: (path: string) => void;
  onDirty: (dirty: boolean) => void;
  /** Open another project file (go to definition, problems in other files). */
  onOpenFile?: (path: string) => void;
  /** Cmd/Ctrl+P. */
  onQuickOpen?: () => void;
  /** False while this file's tab is hidden behind another one. */
  active?: boolean;
};

const FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
const EMPTY_STATE: DocumentState = {
  status: "loading",
  error: null,
  saveError: null,
  language: "plaintext",
  dirty: false,
  saving: false,
  savedTick: 0,
  conflict: false,
  deleted: false,
  reloadedTick: 0,
};
const noopSubscribe = () => () => {};
const mod = isMac ? "⌘" : "Ctrl+";
const alt = isMac ? "⌥" : "Alt+";
const shift = isMac ? "⇧" : "Shift+";

function useDocument(root: string, path: string) {
  const [doc, setDoc] = useState<ProjectDocument | null>(null);
  useEffect(() => {
    const next = acquireDocument(root, path);
    setDoc(next);
    return () => releaseDocument(next);
  }, [root, path]);
  const state = useSyncExternalStore(doc?.subscribe ?? noopSubscribe, doc?.getState ?? (() => EMPTY_STATE));
  return { doc: doc && doc.root === root && doc.path === path ? doc : null, state };
}

type Problem = { severity: monaco.MarkerSeverity; message: string; line: number; column: number; source: string };

const OWNER_LABELS: Record<string, string> = { typescript: "ts", typescriptreact: "ts", javascript: "ts", json: "json", css: "css", scss: "scss", less: "less", html: "html" };

/** "ts(2307)", like VS Code's Problems list. */
function markerSource(marker: monaco.editor.IMarker): string {
  const label = marker.source ?? OWNER_LABELS[marker.owner] ?? marker.owner;
  const code = typeof marker.code === "object" ? marker.code?.value : marker.code;
  return code ? `${label}(${code})` : label;
}

function useProblems(uri: monaco.Uri | null): Problem[] {
  const [problems, setProblems] = useState<Problem[]>([]);
  useEffect(() => {
    if (!uri) return;
    const read = () =>
      setProblems(
        monaco.editor
          .getModelMarkers({ resource: uri })
          .filter((m) => m.severity >= monaco.MarkerSeverity.Info)
          .sort((a, b) => b.severity - a.severity || a.startLineNumber - b.startLineNumber)
          .map((m) => ({
            severity: m.severity,
            message: m.message,
            line: m.startLineNumber,
            column: m.startColumn,
            source: markerSource(m),
          })),
      );
    read();
    const key = uri.toString();
    const sub = monaco.editor.onDidChangeMarkers((uris) => {
      if (uris.some((u) => u.toString() === key)) read();
    });
    return () => sub.dispose();
  }, [uri]);
  return problems;
}

export default function MonacoFileEditor(props: FileEditorProps) {
  use(setupMonaco());
  const { root, path, onOpenInTab, onDirty } = props;
  const { doc, state } = useDocument(root, path);
  const prefs = useEditorPrefs();
  const theme = useThemeName();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [savedFlash, setSavedFlash] = useState(false);
  const [diskFlash, setDiskFlash] = useState(false);
  const problems = useProblems(state.status === "ready" ? (doc?.uri ?? null) : null);

  useEffect(() => {
    onDirty(state.dirty || state.conflict || (state.deleted && state.status === "ready"));
  }, [state.dirty, state.conflict, state.deleted, state.status, onDirty]);

  useEffect(() => {
    if (!state.savedTick) return;
    setSavedFlash(true);
    const timer = window.setTimeout(() => setSavedFlash(false), 1400);
    return () => window.clearTimeout(timer);
  }, [state.savedTick]);

  useEffect(() => {
    if (!state.reloadedTick) return;
    setDiskFlash(true);
    const timer = window.setTimeout(() => setDiskFlash(false), 2200);
    return () => window.clearTimeout(timer);
  }, [state.reloadedTick]);

  // TypeScript/JavaScript: load the project's config and dependencies.
  useEffect(() => {
    if (!doc?.model || state.status !== "ready" || !isScriptLanguage(state.language)) return;
    void ensureTypeScriptProject(root, path, doc.model.getValue());
  }, [doc, state.status, state.language, root, path]);

  const save = useCallback(() => {
    void doc?.save();
  }, [doc]);

  const options = useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 1.6,
      fontLigatures: false,
      padding: { top: 8, bottom: 8 },
      minimap: { enabled: prefs.minimap, renderCharacters: false, showSlider: "mouseover", maxColumn: 100 },
      wordWrap: prefs.wordWrap ? "on" : "off",
      renderWhitespace: prefs.whitespace ? "all" : "selection",
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: "active", indentation: true, highlightActiveIndentation: true },
      matchBrackets: "always",
      autoClosingBrackets: "languageDefined",
      autoClosingQuotes: "languageDefined",
      autoSurround: "languageDefined",
      autoIndent: "full",
      folding: true,
      showFoldingControls: "mouseover",
      foldingHighlight: false,
      stickyScroll: { enabled: true, maxLineCount: 4 },
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      occurrencesHighlight: "singleFile",
      selectionHighlight: true,
      linkedEditing: true,
      fixedOverflowWidgets: true,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.OnCode },
      inlayHints: { enabled: "offUnlessPressed" },
      quickSuggestions: { other: true, comments: false, strings: true },
      suggest: { showWords: true, preview: true },
      wordBasedSuggestions: "currentDocument",
      "semanticHighlighting.enabled": false,
      largeFileOptimizations: true,
      automaticLayout: true,
      contextmenu: true,
      tabIndex: 0,
    }),
    [prefs.minimap, prefs.wordWrap, prefs.whitespace],
  );

  const onMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      if (!doc) return;
      editorRef.current = editor;
      const disposables: Array<monaco.IDisposable | (() => void)> = [];
      const { KeyMod, KeyCode } = monaco;

      editor.addAction({
        id: "kontinue.save",
        label: "Save",
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => void doc.save(),
      });
      editor.addAction({
        id: "kontinue.quickOpen",
        label: "Go to File…",
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyP],
        run: () => propsRef.current.onQuickOpen?.(),
      });
      if (isMac) {
        // Replace is ⌘H here, like in most Mac editors (Monaco's default is ⌥⌘F).
        editor.addAction({
          id: "kontinue.replace",
          label: "Replace",
          keybindings: [KeyMod.CtrlCmd | KeyCode.KeyH],
          run: (ed) => void ed.getAction("editor.action.startFindReplaceAction")?.run(),
        });
      }
      editor.addAction({
        id: "kontinue.toggleWordWrap",
        label: "Toggle Word Wrap",
        keybindings: [KeyMod.Alt | KeyCode.KeyZ],
        run: () => setEditorPref("wordWrap", !getEditorPrefs().wordWrap),
      });
      editor.addAction({
        id: "kontinue.addSelectionToChat",
        label: "Add Selection to Chat",
        contextMenuGroupId: "0_kontinue",
        contextMenuOrder: 1,
        precondition: "editorHasSelection",
        run: (ed) => {
          const selection = ed.getSelection();
          const model = ed.getModel();
          if (!selection || !model || selection.isEmpty()) return;
          addAnnotation({ kind: "text", source: selectionSource(path, selection), quote: model.getValueInRange(selection).slice(0, 4000), note: "" });
        },
      });

      // Restore where you were, then honor any pending "reveal" (go to definition).
      if (doc.viewState) editor.restoreViewState(doc.viewState);
      const reveal = (target: monaco.IRange | monaco.IPosition | null) => {
        if (!target) return;
        const range =
          "startLineNumber" in target ? target : { startLineNumber: target.lineNumber, startColumn: target.column, endLineNumber: target.lineNumber, endColumn: target.column };
        editor.setSelection(range);
        editor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Immediate);
        editor.focus();
      };
      reveal(takeReveal(doc));
      disposables.push(onRevealRequest((target) => target === doc && reveal(takeReveal(doc))));
      disposables.push(editor.onDidChangeCursorPosition(() => (doc.viewState = editor.saveViewState())));
      disposables.push(editor.onDidScrollChange(() => (doc.viewState = editor.saveViewState())));

      disposables.push(
        registerEditorOpener(editor, {
          root,
          open: (target, selection) => {
            if (selection) requestReveal(root, target, selection);
            propsRef.current.onOpenFile?.(target);
          },
        }),
      );

      // Share the active file and selection with the coding agent.
      let publishTimer: number | null = null;
      const publish = () => {
        if (publishTimer !== null) window.clearTimeout(publishTimer);
        publishTimer = window.setTimeout(() => {
          publishTimer = null;
          const model = editor.getModel();
          const selection = editor.getSelection();
          if (!model || !selection) return;
          publishEditorContext({
            root,
            path,
            language: doc.state.language,
            cursorLine: selection.positionLineNumber,
            selection: selection.isEmpty()
              ? null
              : { startLine: selection.startLineNumber, endLine: selection.endLineNumber, text: model.getValueInRange(selection) },
            dirty: doc.state.dirty,
            at: Date.now(),
          });
        }, 120);
      };
      let mouseSelection = false;
      disposables.push(editor.onDidFocusEditorText(publish));
      disposables.push(
        editor.onDidChangeCursorSelection((event) => {
          mouseSelection = event.source === "mouse";
          if (editor.hasTextFocus()) publish();
        }),
      );
      disposables.push(() => {
        if (publishTimer !== null) window.clearTimeout(publishTimer);
      });

      // The "Annotate" bubble for text selected with the mouse.
      disposables.push(
        registerAnnotationSource(() => {
          const selection = editor.getSelection();
          const model = editor.getModel();
          const node = editor.getDomNode();
          if (!mouseSelection || !selection || selection.isEmpty() || !model || !node || !editor.hasTextFocus()) return null;
          if ((editor.getSelections()?.length ?? 0) > 1) return null;
          const start = editor.getScrolledVisiblePosition(selection.getStartPosition());
          if (!start) return null;
          const rect = node.getBoundingClientRect();
          return {
            source: selectionSource(path, selection),
            quote: model.getValueInRange(selection).trim().slice(0, 4000),
            x: Math.min(window.innerWidth - 140, Math.max(12, rect.left + start.left)),
            y: Math.max(12, rect.top + start.top - 40),
          };
        }),
      );

      editor.onDidDispose(() => {
        for (const d of disposables) (typeof d === "function" ? d : () => d.dispose())();
        if (editorRef.current === editor) editorRef.current = null;
      });
    },
    [doc, root, path],
  );

  useEffect(() => () => clearEditorContext(root, path), [root, path]);

  // A hidden tab must give up focus: browsers don't always send "blur" to an
  // element that is hidden while focused, and Monaco would keep sending
  // shortcuts (⌘/, ⌘Z) to it instead of the visible editor.
  const active = props.active ?? true;
  const wasActive = useRef(active);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    const node = editor?.getDomNode();
    if (!active && node && document.activeElement instanceof HTMLElement && node.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (active && !wasActive.current) editor?.focus();
    wasActive.current = active;
  }, [active]);

  const revealProblem = (problem: Problem) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setPosition({ lineNumber: problem.line, column: problem.column });
    editor.revealLineInCenterIfOutsideViewport(problem.line);
    editor.focus();
  };

  const runAction = (id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void editor.getAction(id)?.run();
  };

  const errors = problems.filter((p) => p.severity === monaco.MarkerSeverity.Error).length;
  const warnings = problems.filter((p) => p.severity === monaco.MarkerSeverity.Warning).length;
  const label = languageDef(state.language)?.label ?? state.language;
  const saveLabel = state.saving ? "Saving" : savedFlash ? "Saved" : "Save";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate font-mono text-caption text-muted-foreground" title={path}>
          {path}
          {diskFlash ? <span className="ml-2 font-sans text-purple-500/90">Updated from disk</span> : null}
        </span>
        {state.status === "ready" && (errors || warnings) ? (
          <button
            type="button"
            title="Show problems"
            onClick={() => setEditorPref("problems", !prefs.problems)}
            className="flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-caption text-muted-foreground kontinue-hover hover:text-foreground"
          >
            {errors ? (
              <span className="flex items-center gap-0.5 text-rose-500">
                <AlertCircle size={11} /> {errors}
              </span>
            ) : null}
            {warnings ? (
              <span className="flex items-center gap-0.5 text-amber-500">
                <AlertTriangle size={11} /> {warnings}
              </span>
            ) : null}
          </button>
        ) : null}
        <span className="shrink-0 px-1.5 text-caption text-muted-foreground/80">{label}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Editor options"
              aria-label="Editor options"
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground kontinue-hover hover:text-foreground data-[state=open]:text-foreground"
            >
              <SlidersHorizontal size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuCheckboxItem checked={prefs.wordWrap} onCheckedChange={(v) => setEditorPref("wordWrap", v === true)}>
              Word wrap <DropdownMenuShortcut>{alt}Z</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.minimap} onCheckedChange={(v) => setEditorPref("minimap", v === true)}>
              Minimap
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.whitespace} onCheckedChange={(v) => setEditorPref("whitespace", v === true)}>
              Show whitespace
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.problems} onCheckedChange={(v) => setEditorPref("problems", v === true)}>
              Problems panel
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runAction("editor.action.formatDocument")}>
              Format document <DropdownMenuShortcut>{shift}{alt}F</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runAction("actions.find")}>
              Find <DropdownMenuShortcut>{mod}F</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runAction("editor.action.startFindReplaceAction")}>
              Replace <DropdownMenuShortcut>{isMac ? "⌘H" : "Ctrl+H"}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runAction("editor.action.gotoLine")}>
              Go to line <DropdownMenuShortcut>{isMac ? "⌃G" : "Ctrl+G"}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runAction("editor.action.quickCommand")}>
              All editor commands <DropdownMenuShortcut>F1</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onOpenInTab ? (
          <button
            type="button"
            title="Open this file in a full tab"
            onClick={() => onOpenInTab?.(path)}
            className="flex h-6 shrink-0 cursor-pointer items-center rounded-full px-2 text-caption text-muted-foreground kontinue-hover hover:text-foreground"
          >
            Open in a full tab
          </button>
        ) : null}
        <button
          type="button"
          title={`Save (${mod}S)`}
          disabled={(!state.dirty && !state.deleted) || state.saving}
          onClick={save}
          className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-caption text-foreground/75 hover:text-foreground disabled:cursor-default disabled:text-muted-foreground/40"
        >
          {state.saving ? <Loader2 size={10} className="animate-spin" /> : savedFlash ? <Check size={11} className="text-emerald-500" /> : null}
          {saveLabel}
        </button>
      </div>

      {state.saveError ? <p className="px-3 pb-1.5 text-label text-rose-400">Couldn't save: {state.saveError}</p> : null}
      {state.conflict ? (
        <Notice tone="warn" message="This file changed on disk while you had unsaved changes.">
          <NoticeButton onClick={() => void doc?.reloadFromDisk()}>Load disk version</NoticeButton>
          <NoticeButton onClick={() => doc?.keepMine()}>Keep mine</NoticeButton>
        </Notice>
      ) : state.deleted && state.status === "ready" ? (
        <Notice tone="warn" message="This file was deleted on disk. Saving writes it again.">
          <NoticeButton onClick={save}>Save again</NoticeButton>
        </Notice>
      ) : null}

      {state.status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <AlertCircle size={18} strokeWidth={1.5} className="text-foreground/30" />
          <p className="max-w-[18rem] text-label text-muted-foreground">{state.error}</p>
        </div>
      ) : state.status === "loading" || !doc ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1" data-annotate-source={`File ${path}`}>
          <Editor
            path={doc.uri.toString()}
            keepCurrentModel
            saveViewState={false}
            theme={theme}
            options={options}
            onMount={onMount}
            loading={<Loader2 className="size-4 animate-spin text-muted-foreground" />}
          />
        </div>
      )}

      {prefs.problems && state.status === "ready" ? (
        <ProblemsPanel problems={problems} onSelect={revealProblem} onClose={() => setEditorPref("problems", false)} />
      ) : null}
    </div>
  );
}

function selectionSource(path: string, selection: monaco.Selection) {
  const lines =
    selection.startLineNumber === selection.endLineNumber ? `line ${selection.startLineNumber}` : `lines ${selection.startLineNumber}-${selection.endLineNumber}`;
  return `File ${path} (${lines})`;
}

function Notice({ tone, message, children }: { tone: "warn"; message: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mx-2 mb-1.5 flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-label",
        tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      <AlertTriangle size={12} className="shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {children}
    </div>
  );
}

function NoticeButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-6 shrink-0 cursor-pointer rounded-full px-2.5 font-medium kontinue-hover"
    >
      {children}
    </button>
  );
}

function ProblemsPanel({ problems, onSelect, onClose }: { problems: Problem[]; onSelect: (p: Problem) => void; onClose: () => void }) {
  return (
    <div className="flex max-h-[34%] min-h-[64px] shrink-0 flex-col border-t border-black/[0.06] dark:border-white/[0.06]">
      <div className="flex h-7 shrink-0 items-center px-3">
        <span className="text-caption font-medium text-foreground/80">Problems</span>
        <span className="ml-1.5 text-caption text-muted-foreground">{problems.length}</span>
        <button type="button" onClick={onClose} className="ml-auto cursor-pointer text-caption text-muted-foreground hover:text-foreground">
          Hide
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-1.5">
        {problems.length === 0 ? (
          <p className="px-3 py-1 text-label text-muted-foreground">No problems in this file.</p>
        ) : (
          problems.map((problem) => (
            <button
              key={`${problem.line}:${problem.column}:${problem.source}:${problem.message}`}
              type="button"
              onClick={() => onSelect(problem)}
              className="flex w-full cursor-pointer items-start gap-2 px-3 py-1 text-left text-label kontinue-hover"
            >
              {problem.severity === monaco.MarkerSeverity.Error ? (
                <AlertCircle size={12} className="mt-0.5 shrink-0 text-rose-500" />
              ) : problem.severity === monaco.MarkerSeverity.Warning ? (
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
              ) : (
                <Info size={12} className="mt-0.5 shrink-0 text-sky-500" />
              )}
              <span className="min-w-0 flex-1 whitespace-pre-wrap text-foreground/85">{problem.message}</span>
              <span className="shrink-0 font-mono text-caption text-muted-foreground">
                {problem.source} {problem.line}:{problem.column}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
