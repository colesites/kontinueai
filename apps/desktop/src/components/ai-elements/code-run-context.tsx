// Where a ▶ Run on a shell code block executes: the chat's project folder.
// Provided by the Kode chat; without it (Home chat, no project) code blocks
// only offer Copy.

import { createContext, useContext } from "react";

export type CodeRunTarget = { root: string; env?: Record<string, string> } | null;

export const CodeRunContext = createContext<CodeRunTarget>(null);

export function useCodeRunTarget(): CodeRunTarget {
  return useContext(CodeRunContext);
}
