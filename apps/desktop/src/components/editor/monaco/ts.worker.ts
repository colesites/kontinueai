// The TypeScript worker: Monaco's, plus auto-import completions. Monaco asks
// TypeScript for completions without exports from other modules and never
// applies an import on accept, so these two methods back the provider in
// ./auto-import.ts.

import { initialize } from "monaco-editor/internal/common/initialize";
import { TypeScriptWorker } from "monaco-editor/languages/features/typescript/tsWorker";

const PREFERENCES = {
  includeCompletionsForModuleExports: true,
  includeCompletionsForImportStatements: true,
  includeCompletionsWithInsertText: true,
  allowIncompleteCompletions: true,
  importModuleSpecifierPreference: "shortest",
  quotePreference: "auto",
} as const;

type Part = { text: string };
const text = (parts: Part[] | undefined) => (parts ?? []).map((p) => p.text).join("");

class KontinueTypeScriptWorker extends TypeScriptWorker {
  // Like tsc: dependency files are only part of the program when something
  // imports or references them. As root files, any package's global
  // declarations (or a `declare module "*"`) would leak into every file.
  getScriptFileNames(): string[] {
    return super.getScriptFileNames().filter((name) => !name.includes("/node_modules/"));
  }

  async getAutoImportCompletions(fileName: string, position: number) {
    const info = this.getLanguageService().getCompletionsAtPosition(fileName, position, PREFERENCES);
    if (!info) return null;
    const entries = info.entries
      .filter((entry) => entry.hasAction && entry.source && entry.data)
      .slice(0, 300)
      .map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        sortText: entry.sortText,
        source: entry.source ?? "",
        data: entry.data,
      }));
    return { isIncomplete: Boolean(info.isIncomplete), entries };
  }

  async getAutoImportDetails(fileName: string, position: number, name: string, source: string, data: unknown, formatOptions: object) {
    const details = this.getLanguageService().getCompletionEntryDetails(
      fileName,
      position,
      name,
      formatOptions,
      source,
      PREFERENCES,
      data as never,
    );
    if (!details) return null;
    return {
      detail: text(details.displayParts),
      documentation: text(details.documentation),
      // Edits to this file only (the import line).
      edits: (details.codeActions ?? []).flatMap((action) =>
        action.changes.filter((change) => change.fileName === fileName).flatMap((change) => change.textChanges),
      ),
      description: details.codeActions?.[0]?.description ?? "",
    };
  }
}

self.onmessage = () => {
  initialize((ctx: unknown, createData: unknown) => new KontinueTypeScriptWorker(ctx, createData));
};
