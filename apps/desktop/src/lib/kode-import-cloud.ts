// Sharing imported chats' continuation context across the user's devices.
// The importing device uploads it (Convex kodeImportContexts) after an import
// or a sync that changed it; another device reads it when it first opens the
// chat (ImportedChatBar → useImportContext). Calls are imperative and wrapped,
// so an older backend without these functions just means "no shared context".

import { useEffect, useRef } from "react";
import { useConvex } from "convex/react";
import { api } from "./convex-api";
import { listImportContexts, subscribeImportContexts } from "./kode-import";
import { uploadKey, type RemoteContext } from "./kode-import-remote";

const UPLOADED_KEY = "kode.import-context-uploaded";
const MAX_PROMPT = 110_000;

function loadUploaded(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(UPLOADED_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Mount once (ViewLayout). Uploads contexts that changed, a few seconds after. */
export function useImportContextUpload(chatIds: string[]) {
  const convex = useConvex();
  const known = useRef(new Set<string>());
  known.current = new Set(chatIds);
  useEffect(() => {
    let timer: number | undefined;
    let unsupported = false;
    const run = async () => {
      if (unsupported) return;
      const uploaded = loadUploaded();
      for (const context of listImportContexts()) {
        // Only the device that has the transcript is the source of truth.
        if (!context.sourcePath || !known.current.has(context.chatId) || !context.contextPrompt) continue;
        const key = uploadKey(context);
        if (uploaded[context.chatId] === key) continue;
        try {
          await convex.mutation(api.kode.saveImportContext, {
            chatId: context.chatId,
            contextPrompt: context.contextPrompt.slice(0, MAX_PROMPT),
            summary: context.summary?.slice(0, 19_000),
            projectName: context.projectName,
          });
          uploaded[context.chatId] = key;
        } catch (error) {
          if (/Could not find|not found.*function|No such function/i.test(String(error))) unsupported = true;
          break;
        }
      }
      try {
        localStorage.setItem(UPLOADED_KEY, JSON.stringify(uploaded));
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 3_000);
    };
    schedule();
    const unsubscribe = subscribeImportContexts(schedule);
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [convex]);
}

/** The shared context for a chat, or null (none saved, or older backend). */
export async function fetchRemoteContext(
  convex: ReturnType<typeof useConvex>,
  chatId: string,
): Promise<RemoteContext | null> {
  try {
    return await convex.query(api.kode.getImportContext, { chatId });
  } catch {
    return null;
  }
}
