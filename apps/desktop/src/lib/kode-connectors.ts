// Your connected web apps (GitHub, Gmail, Notion, …) as Kode tools. The tools
// run on the Kontinue server (apps/web/src/app/api/kode/connectors), where the
// OAuth tokens live; Kode only sends the call and gets text back.

import { invoke } from "@tauri-apps/api/core";
import type { KodeExtraTool } from "./kode-agent";
import { getSessionToken } from "./kode-chat";

type ConnectorToolDef = { name: string; description: string; parameters: Record<string, unknown> };

const PREFIX = "connector__";
const LABELS: Record<string, string> = {
  github: "GitHub",
  gmail: "Gmail",
  notion: "Notion",
  vercel: "Vercel",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  google_sheets: "Google Sheets",
  todoist: "Todoist",
};

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getSessionToken();
  if (!token) throw new Error("Sign in to use connected apps.");
  return invoke<T>("kontinue_api_post", { path: "/api/kode/connectors", sessionToken: token, body });
}

/** Tools for every connected app; empty when signed out or offline. */
export async function loadConnectorTools(): Promise<KodeExtraTool[]> {
  let defs: ConnectorToolDef[] = [];
  try {
    defs = (await post<{ tools: ConnectorToolDef[] }>({ action: "list" })).tools ?? [];
  } catch {
    return [];
  }
  return defs.map((def) => {
    const label = LABELS[def.name] ?? def.name;
    return {
      needsApproval: true,
      describe: (args) => {
        const action = typeof args.action === "string" ? args.action.replace(/_/g, " ") : "";
        return action ? `${label}: ${action}` : `Use ${label}`;
      },
      definition: {
        type: "function",
        function: {
          name: `${PREFIX}${def.name}`,
          description: `${def.description}\n\n(The user's connected ${label} account, via Kontinue.)`,
          parameters: def.parameters,
        },
      },
      run: async (args) => {
        const out = await post<{ result: string; isError?: boolean }>({ action: "call", name: def.name, args });
        if (out.isError) throw new Error(out.result.replace(/^Error:\s*/, ""));
        return out.result;
      },
    };
  });
}
