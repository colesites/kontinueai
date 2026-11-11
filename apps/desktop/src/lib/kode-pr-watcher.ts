// Background check of every PR a Kode chat opened (see kode-pr-watch.ts for
// what is remembered and decided). Mount once, in ViewLayout.

import { useEffect, useRef } from "react";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { getPrThreads, listPrComments, listPullRequests, type PullRequest } from "./kode-prs";
import { diffPr, getChatModel, getPrWatches, prEventPrompt, updatePrWatch } from "./kode-pr-watch";
import { schedulePrompt } from "./kode-schedule";
import { getSettings, useAppSettings } from "./app-settings";
import { useKodeWorkspace } from "./kode-workspace";


type Target = { url: string; chatId: string; chatTitle: string };

export function usePrWatcher() {
  const { kodeChats, folders, archiveKodeChat, activeChatId } = useKodeWorkspace();
  const { prPollSeconds } = useAppSettings();
  const latest = useRef({ kodeChats, folders, archiveKodeChat, activeChatId });
  latest.current = { kodeChats, folders, archiveKodeChat, activeChatId };

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
            const prev = getPrWatches()[target.url] ?? { url: target.url, chatId: target.chatId, autoFix: getSettings().prAutoFixDefault };
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

            // Settings → Source control → Auto-archive merged threads (not the
            // chat you're looking at).
            if (
              patch.state === "MERGED" &&
              prev.state !== "MERGED" &&
              getSettings().autoArchiveMerged &&
              latest.current.activeChatId !== target.chatId
            ) {
              void latest.current.archiveKodeChat(target.chatId, true).catch(() => {});
            }

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

    // Settings → Source control: 0 pauses background checks.
    if (prPollSeconds <= 0) return;
    void tick();
    const timer = window.setInterval(() => void tick(), prPollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [prPollSeconds]);
}
