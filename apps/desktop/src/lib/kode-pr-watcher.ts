// Background check of every PR a Kode chat opened (see kode-pr-watch.ts for
// what is remembered and decided). Mount once, in ViewLayout.

import { useEffect, useRef } from "react";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { getPrThreads, listPrComments, listPullRequests, type PullRequest } from "./kode-prs";
import { diffPr, getChatModel, getPrWatches, prEventPrompt, updatePrWatch } from "./kode-pr-watch";
import { schedulePrompt } from "./kode-schedule";
import { useKodeWorkspace } from "./kode-workspace";

const POLL_MS = 60_000;

type Target = { url: string; chatId: string; chatTitle: string };

export function usePrWatcher() {
  const { kodeChats, folders } = useKodeWorkspace();
  const latest = useRef({ kodeChats, folders });
  latest.current = { kodeChats, folders };

  useEffect(() => {
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const { kodeChats: chats, folders: projectFolders } = latest.current;
        const watches = getPrWatches();

        // Linked PRs still worth checking, grouped by project so each project
        // costs one `gh pr list` call.
        const byRoot = new Map<string, Target[]>();
        for (const [url, link] of Object.entries(getPrThreads())) {
          const state = watches[url]?.state;
          if (state === "MERGED" || state === "CLOSED") continue;
          const chat = chats.find((c) => c.id === link.chatId);
          if (!chat || chat.archived) continue;
          const root = projectFolders.find((f) => f.id === chat.projectId)?.path;
          if (!root) continue;
          byRoot.set(root, [...(byRoot.get(root) ?? []), { url, chatId: chat.id, chatTitle: chat.title }]);
        }

        for (const [root, targets] of byRoot) {
          let prs: PullRequest[];
          try {
            prs = await listPullRequests(root, "all");
          } catch (error) {
            for (const t of targets) updatePrWatch(t.url, t.chatId, { lastError: String(error) });
            continue;
          }
          for (const target of targets) {
            const pr = prs.find((p) => p.url.toLowerCase() === target.url);
            if (!pr) continue;
            const prev = getPrWatches()[target.url] ?? { url: target.url, chatId: target.chatId, autoFix: false };
            const comments =
              prev.autoFix && pr.state === "OPEN" ? await listPrComments(root, pr.number).catch(() => null) : null;
            const { events, patch } = diffPr(prev, pr, comments);

            if (!prev.autoFix) {
              // Not relaying: don't mark anything as reported, so turning
              // Auto-fix on later still sends what's failing right now.
              delete patch.reportedFailing;
              delete patch.reportedConflict;
            }
            updatePrWatch(target.url, target.chatId, patch);

            if (!prev.autoFix) continue;
            const text = prEventPrompt(pr, events);
            if (!text) continue;
            schedulePrompt({
              chatId: target.chatId,
              chatTitle: target.chatTitle,
              text,
              modelId: getChatModel(target.chatId) ?? KODE_MODEL_ID,
              // Edits and routine commands run; pushes and deletes still ask.
              mode: "auto",
              fireAt: Date.now(),
              reason: "pr",
            });
          }
        }
      } finally {
        running = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
}
