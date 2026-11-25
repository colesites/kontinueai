// Background check of every PR a Kode chat opened (see kode-pr-watch.ts for
// what is remembered and decided). Mount once, in ViewLayout.

import { useEffect, useRef } from "react";
import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { getPrThreads, getPullRequest, listPrComments, type PullRequest, usePrThreads } from "./kode-prs";
import { diffPr, getChatModel, getPrWatches, prEventPrompt, updatePrWatch } from "./kode-pr-watch";
import { schedulePrompt } from "./kode-schedule";
import { getSettings, useAppSettings } from "./app-settings";
import { useKodeWorkspace } from "./kode-workspace";


type Target = { url: string; chatId: string; chatTitle: string };

/** PRs checked at once (each is one `gh pr view`). */
const PARALLEL = 4;

export function usePrWatcher() {
  const { kodeChats, folders, archiveKodeChat, activeChatId } = useKodeWorkspace();
  const { prPollSeconds } = useAppSettings();
  const latest = useRef({ kodeChats, folders, archiveKodeChat, activeChatId });
  latest.current = { kodeChats, folders, archiveKodeChat, activeChatId };
  const tickRef = useRef<(() => void) | null>(null);

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

        // Each PR is fetched on its own (a list of the newest PRs lost older
        // ones and was slow with every PR's checks), a few at a time.
        const jobs = [...byRoot].flatMap(([root, targets]) => targets.map((target) => ({ root, target })));
        const check = async ({ root, target }: { root: string; target: Target }) => {
          let pr: PullRequest;
          try {
            pr = await getPullRequest(root, target.url);
          } catch (error) {
            updatePrWatch(target.url, target.chatId, { lastError: String(error) });
            return;
          }
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
          updatePrWatch(target.url, target.chatId, { ...patch, lastError: undefined });

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

          if (!prev.autoFix) return;
          const text = prEventPrompt(pr, events);
          if (!text) return;
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
        };
        for (let index = 0; index < jobs.length; index += PARALLEL) {
          await Promise.all(jobs.slice(index, index + PARALLEL).map(check));
        }
      } finally {
        running = false;
      }
    };

    // Settings → Source control: 0 pauses background checks.
    if (prPollSeconds <= 0) return;
    tickRef.current = () => void tick();
    void tick();
    const timer = window.setInterval(() => void tick(), prPollSeconds * 1000);
    // Coming back to the app or back online: check now, not a minute later.
    const soon = () => void tick();
    window.addEventListener("focus", soon);
    window.addEventListener("online", soon);
    return () => {
      tickRef.current = null;
      window.clearInterval(timer);
      window.removeEventListener("focus", soon);
      window.removeEventListener("online", soon);
    };
  }, [prPollSeconds]);

  // A chat just opened (or mentioned) a PR: show its status right away.
  const threads = usePrThreads();
  const linkCount = Object.keys(threads).length;
  useEffect(() => {
    if (linkCount === 0) return;
    const timer = window.setTimeout(() => tickRef.current?.(), 1_500);
    return () => window.clearTimeout(timer);
  }, [linkCount]);
}
