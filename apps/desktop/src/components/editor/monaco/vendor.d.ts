// Monaco ships these modules without type declarations.

declare module "monaco-editor/languages/definitions/*" {
  import type { languages } from "monaco-editor/editor";
  export const conf: languages.LanguageConfiguration;
}

// The TypeScript service's provider adapters, reused for .tsx files.
declare module "monaco-editor/languages/features/typescript/tsMode" {
  import type { languages, Uri } from "monaco-editor/editor";
  type Worker = (...uris: Uri[]) => Promise<unknown>;
  export class LibFiles {
    constructor(worker: Worker);
  }
  export class SuggestAdapter implements languages.CompletionItemProvider {
    constructor(worker: Worker);
    provideCompletionItems: languages.CompletionItemProvider["provideCompletionItems"];
  }
  export class SignatureHelpAdapter implements languages.SignatureHelpProvider {
    constructor(worker: Worker);
    provideSignatureHelp: languages.SignatureHelpProvider["provideSignatureHelp"];
  }
  export class QuickInfoAdapter implements languages.HoverProvider {
    constructor(worker: Worker);
    provideHover: languages.HoverProvider["provideHover"];
  }
  export class DocumentHighlightAdapter implements languages.DocumentHighlightProvider {
    constructor(worker: Worker);
    provideDocumentHighlights: languages.DocumentHighlightProvider["provideDocumentHighlights"];
  }
  export class DefinitionAdapter implements languages.DefinitionProvider {
    constructor(libFiles: LibFiles, worker: Worker);
    provideDefinition: languages.DefinitionProvider["provideDefinition"];
  }
  export class ReferenceAdapter implements languages.ReferenceProvider {
    constructor(libFiles: LibFiles, worker: Worker);
    provideReferences: languages.ReferenceProvider["provideReferences"];
  }
  export class OutlineAdapter implements languages.DocumentSymbolProvider {
    constructor(worker: Worker);
    provideDocumentSymbols: languages.DocumentSymbolProvider["provideDocumentSymbols"];
  }
  export class RenameAdapter implements languages.RenameProvider {
    constructor(libFiles: LibFiles, worker: Worker);
    provideRenameEdits: languages.RenameProvider["provideRenameEdits"];
  }
  export class FormatAdapter implements languages.DocumentRangeFormattingEditProvider {
    constructor(worker: Worker);
    provideDocumentRangeFormattingEdits: languages.DocumentRangeFormattingEditProvider["provideDocumentRangeFormattingEdits"];
  }
  export class FormatOnTypeAdapter implements languages.OnTypeFormattingEditProvider {
    constructor(worker: Worker);
    autoFormatTriggerCharacters: string[];
    provideOnTypeFormattingEdits: languages.OnTypeFormattingEditProvider["provideOnTypeFormattingEdits"];
  }
  export class CodeActionAdaptor implements languages.CodeActionProvider {
    constructor(worker: Worker);
    provideCodeActions: languages.CodeActionProvider["provideCodeActions"];
  }
  export class InlayHintsAdapter implements languages.InlayHintsProvider {
    constructor(worker: Worker);
    provideInlayHints: languages.InlayHintsProvider["provideInlayHints"];
  }
  export class DiagnosticsAdapter {
    constructor(libFiles: LibFiles, defaults: unknown, selector: string, worker: Worker);
  }
}

declare module "monaco-editor/internal/common/initialize" {
  export function initialize(create: (ctx: unknown, createData: unknown) => unknown): void;
}

declare module "monaco-editor/languages/features/typescript/tsWorker" {
  import type { LanguageService } from "typescript";
  export class TypeScriptWorker {
    constructor(ctx: unknown, createData: unknown);
    getLanguageService(): LanguageService;
    getScriptFileNames(): string[];
  }
}
