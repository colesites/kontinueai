// Completions for exports of other modules, with the import added on accept
// (VS Code's auto-imports). Backed by ./ts.worker.ts.

import { monaco, typescript } from "./monaco";

type AutoImportEntry = { name: string; kind: string; sortText: string; source: string; data: unknown };
type AutoImportWorker = {
  getAutoImportCompletions(fileName: string, position: number): Promise<{ isIncomplete: boolean; entries: AutoImportEntry[] } | null>;
  getAutoImportDetails(
    fileName: string,
    position: number,
    name: string,
    source: string,
    data: unknown,
    formatOptions: object,
  ): Promise<{ detail: string; documentation: string; description: string; edits: Array<{ span: { start: number; length: number }; newText: string }> } | null>;
};

type Item = monaco.languages.CompletionItem & { autoImport: { uri: monaco.Uri; offset: number; entry: AutoImportEntry } };

const Kind = monaco.languages.CompletionItemKind;
const KINDS: Record<string, monaco.languages.CompletionItemKind> = {
  function: Kind.Function,
  method: Kind.Method,
  class: Kind.Class,
  interface: Kind.Interface,
  type: Kind.TypeParameter,
  alias: Kind.Reference,
  enum: Kind.Enum,
  module: Kind.Module,
  const: Kind.Constant,
  let: Kind.Variable,
  var: Kind.Variable,
};

async function workerFor(model: monaco.editor.ITextModel): Promise<AutoImportWorker> {
  const get = model.getLanguageId() === "javascript" ? await typescript.getJavaScriptWorker() : await typescript.getTypeScriptWorker();
  return (await get(model.uri)) as unknown as AutoImportWorker;
}

function formatOptions(model: monaco.editor.ITextModel) {
  const options = model.getOptions();
  return {
    tabSize: options.tabSize,
    indentSize: options.indentSize,
    convertTabsToSpaces: options.insertSpaces,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
    semicolons: "ignore",
  };
}

const provider: monaco.languages.CompletionItemProvider = {
  triggerCharacters: [],
  async provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    if (!word.word) return { suggestions: [] };
    const offset = model.getOffsetAt(position);
    const result = await workerFor(model)
      .then((worker) => worker.getAutoImportCompletions(model.uri.toString(), offset))
      .catch(() => null);
    if (!result || model.isDisposed()) return { suggestions: [] };
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    const suggestions: Item[] = result.entries.map((entry) => ({
      label: { label: entry.name, description: entry.source },
      kind: KINDS[entry.kind] ?? Kind.Property,
      insertText: entry.name,
      range,
      sortText: entry.sortText,
      detail: `Add import from "${entry.source}"`,
      autoImport: { uri: model.uri, offset, entry },
    }));
    return { suggestions, incomplete: result.isIncomplete };
  },
  async resolveCompletionItem(item) {
    const { autoImport } = item as Item;
    if (!autoImport) return item;
    const model = monaco.editor.getModel(autoImport.uri);
    if (!model) return item;
    const { entry, offset } = autoImport;
    const details = await workerFor(model)
      .then((worker) => worker.getAutoImportDetails(model.uri.toString(), offset, entry.name, entry.source, entry.data, formatOptions(model)))
      .catch(() => null);
    if (!details) return item;
    return {
      ...item,
      detail: details.description || details.detail,
      documentation: details.documentation ? { value: `\`\`\`ts\n${details.detail}\n\`\`\`\n\n${details.documentation}` } : details.detail,
      additionalTextEdits: details.edits.map((edit) => ({
        range: monaco.Range.fromPositions(model.getPositionAt(edit.span.start), model.getPositionAt(edit.span.start + edit.span.length)),
        text: edit.newText,
      })),
    };
  },
};

let registered = false;

export function registerAutoImports() {
  if (registered) return;
  registered = true;
  for (const id of ["typescript", "typescriptreact", "javascript"]) monaco.languages.registerCompletionItemProvider(id, provider);
}
