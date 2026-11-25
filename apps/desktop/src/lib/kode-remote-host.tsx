// Kode remote control, the desktop side (backend: convex/kodeRemote.ts).
//
// With Settings → Remote control on, this computer:
// - registers itself and sends a heartbeat, so your phone and the web app
//   list it as online;
// - shares its project names and which chat sits under which project;
// - runs commands sent from your other devices: a prompt (PlanView sends it
//   through the normal send path, see remoteInboxSlot), an approval, an
//   answer, Stop;
// - mirrors each run's status, tool steps and pending questions, and streams
//   the reply while someone has the chat open remotely;
// - pushes a notification when a run needs you or a remote run finishes;
// - stays awake while a run is going.
//
// Everything goes over the app's existing Convex connection (outbound only).

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  KODE_REMOTE_DEFAULT_MODE,
  KODE_REMOTE_HEARTBEAT_MS,
  isKodeRemoteMode,
  type KodeRemoteMode,
} from "@repo/core/kode-remote";
import { KODE_DEFAULT_MODEL_ID } from "@repo/ai/lib/kode";
import { pendingSlot, sendingSlot } from "@/components/view/plan/run-state";
import { remoteApi, type RemoteCommand } from "./convex-api";
import { getSettings, updateSettings, useAppSettings } from "./app-settings";
import { useKodeAgentRuntime } from "./kode-agent-runtime";
import { useSubagentModels } from "./kode-fanout";
import { createRunSlot, runAborts, useRunSlot } from "./kode-run-state";
import { remoteRunView, runSignature, type RemoteRunView } from "./kode-remote-snapshot";
import { idleFor } from "./kode-schedule";
import { deviceId } from "./kode-webhooks";
import { useKodeWorkspace } from "./kode-workspace";

const REGISTERED_KEY = "kode.remote-registered";
const AWAY_MS = 2 * 60_000;
const SYNC_DEBOUNCE_MS = 2_000;
const STATUS_THROTTLE_MS = 300;
const TEXT_THROTTLE_MS = 1_000;
const MAX_SYNCED_CHATS = 300;
const STALE_SEND_MS = 60_000;

/** A prompt from another device, waiting for PlanView to send it. */
export type RemoteSend = {
  commandId: string;
  chatId: string;
  text: string;
  modelId?: string;
  mode: KodeRemoteMode;
  receivedAt: number;
};

export const remoteInboxSlot = createRunSlot<RemoteSend[]>([]);

/** Chats whose current turn came from a phone or browser (for the "finished" push). */
const remoteStarted = new Set<string>();

let finish: ((commandId: string, ok: boolean, error?: string) => void) | null = null;

/** PlanView: the remote prompt went out (or couldn't). */
export function finishRemoteSend(item: RemoteSend, ok: boolean, error?: string) {
  if (ok) remoteStarted.add(item.chatId);
  finish?.(item.commandId, ok, error);
}

export function platformId(): "macos" | "windows" | "linux" {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Mac/i.test(agent)) return "macos";
  if (/Win/i.test(agent)) return "windows";
  return "linux";
}

/** The name your other devices show for this computer. */
export function useComputerName(): string {
  const { remoteDeviceName } = useAppSettings();
  const [systemName, setSystemName] = useState<string | null>(null);
  useEffect(() => {
    void invoke<string | null>("kode_computer_name").then(setSystemName).catch(() => {});
  }, []);
  const fallback = platformId() === "macos" ? "My Mac" : platformId() === "windows" ? "My PC" : "My computer";
  return remoteDeviceName.trim() || systemName || fallback;
}

/** Mount once (ViewLayout). Renders nothing. */
export function KodeRemoteHost() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const settings = useAppSettings();
  const enabled = settings.remoteControl && isAuthenticated;
  const runtime = useKodeAgentRuntime();
  const workspace = useKodeWorkspace();
  const models = useSubagentModels();
  const name = useComputerName();
  const id = useMemo(() => deviceId(), []);
  const [registered, setRegistered] = useState(false);

  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // ── Registration + heartbeat ─────────────────────────────────────────────
  const defaultModelId = settings.defaultKodeModel || KODE_DEFAULT_MODEL_ID;
  const modelsKey = JSON.stringify(models.map((model) => [model.id, model.name]));
  useEffect(() => {
    if (!isAuthenticated) return;
    const wasRegistered = localStorage.getItem(REGISTERED_KEY) === "1";
    // Never turned on: nothing to tell the backend.
    if (!settings.remoteControl && !wasRegistered) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getVersion()
        .catch(() => undefined)
        .then((appVersion) =>
          convex.mutation(remoteApi.kodeRemote.registerDevice, {
            deviceId: id,
            name,
            platform: platformId(),
            appVersion,
            enabled: settings.remoteControl,
            models: models.map((model) => ({ id: model.id, name: model.name })),
            defaultModelId,
          }),
        )
        .then(() => {
          if (cancelled) return;
          if (settings.remoteControl) {
            localStorage.setItem(REGISTERED_KEY, "1");
            setRegistered(true);
          } else {
            setRegistered(false);
          }
        })
        .catch((error) => console.warn("[Kode remote] register failed:", error));
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, id, isAuthenticated, settings.remoteControl, name, modelsKey, defaultModelId]);

  // Runs left over from a previous session are over.
  const resetDone = useRef(false);
  useEffect(() => {
    if (!enabled || !registered || resetDone.current) return;
    resetDone.current = true;
    void convex.mutation(remoteApi.kodeRemote.resetRuns, { deviceId: id }).catch(() => {});
  }, [convex, enabled, registered, id]);

  useEffect(() => {
    if (!enabled || !registered) return;
    const beat = () => void convex.mutation(remoteApi.kodeRemote.heartbeat, { deviceId: id }).catch(() => {});
    const timer = window.setInterval(beat, KODE_REMOTE_HEARTBEAT_MS);
    window.addEventListener("online", beat);
    window.addEventListener("focus", beat);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", beat);
      window.removeEventListener("focus", beat);
    };
  }, [convex, enabled, registered, id]);

  // ── Projects and chats ───────────────────────────────────────────────────
  const workspaceKey = useMemo(() => {
    const projects = workspace.folders.map((folder) => ({ key: folder.id, name: folder.name }));
    const chats = workspace.kodeChats
      .filter((chat) => !chat.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SYNCED_CHATS)
      .map((chat) => ({ chatId: chat.id, projectKey: chat.projectId ?? null }));
    return JSON.stringify({ projects, chats });
  }, [workspace.folders, workspace.kodeChats]);
  const syncedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !registered || syncedKey.current === workspaceKey) return;
    const timer = window.setTimeout(() => {
      const payload = JSON.parse(workspaceKey) as {
        projects: { key: string; name: string }[];
        chats: { chatId: string; projectKey: string | null }[];
      };
      void convex
        .mutation(remoteApi.kodeRemote.syncWorkspace, { deviceId: id, ...payload })
        .then(() => (syncedKey.current = workspaceKey))
        .catch((error) => console.warn("[Kode remote] sync failed:", error));
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [convex, enabled, registered, id, workspaceKey]);

  // ── Commands ─────────────────────────────────────────────────────────────
  const host = useQuery(remoteApi.kodeRemote.hostState, enabled && registered ? { deviceId: id } : "skip");
  const handled = useRef(new Set<string>());
  useEffect(() => {
    finish = (commandId, ok, error) => {
      void convex.mutation(remoteApi.kodeRemote.completeCommand, { commandId, ok, error }).catch(() => {});
    };
    return () => {
      finish = null;
    };
  }, [convex]);

  useEffect(() => {
    if (!host?.commands.length) return;
    const complete = (command: RemoteCommand, ok: boolean, error?: string) =>
      void convex.mutation(remoteApi.kodeRemote.completeCommand, { commandId: command.id, ok, error }).catch(() => {});
    for (const command of host.commands) {
      if (handled.current.has(command.id)) continue;
      handled.current.add(command.id);
      if (command.expiresAt < Date.now()) {
        complete(command, false, "It reached your computer too late.");
        continue;
      }
      const { pendingByChat, resolveApproval, resolveOptions } = runtimeRef.current;
      const waiting = pendingByChat[command.chatId] ?? [];
      switch (command.kind) {
        case "send": {
          const text = command.text?.trim();
          if (!text) {
            complete(command, false, "The message was empty.");
            break;
          }
          const { folders, assignChatsToFolder, setActiveTab } = workspaceRef.current;
          if (command.newChat && command.projectKey && folders.some((folder) => folder.id === command.projectKey)) {
            assignChatsToFolder([command.chatId], command.projectKey);
          }
          remoteInboxSlot.set((list) => [
            ...list,
            {
              commandId: command.id,
              chatId: command.chatId,
              text,
              modelId: command.modelId,
              mode: isKodeRemoteMode(command.mode) ? command.mode : KODE_REMOTE_DEFAULT_MODE,
              receivedAt: Date.now(),
            },
          ]);
          setActiveTab("kode");
          break;
        }
        case "approve": {
          const step = waiting.find((item) => item.id === command.stepId && item.state === "pending-approval");
          if (!step) {
            complete(command, false, "That request isn't waiting anymore.");
            break;
          }
          resolveApproval(step.id, Boolean(command.approved));
          complete(command, true);
          break;
        }
        case "answer": {
          const step = waiting.find((item) => item.id === command.stepId && item.state === "pending-options");
          if (!step) {
            complete(command, false, "That question isn't waiting anymore.");
            break;
          }
          resolveOptions(step.id, command.values ?? []);
          complete(command, true);
          break;
        }
        case "stop": {
          remoteInboxSlot.set((list) => list.filter((item) => item.chatId !== command.chatId));
          runAborts.get(command.chatId)?.abort();
          // A turn waiting on you only checks for Stop once that is answered.
          for (const step of waiting) {
            if (step.state === "pending-approval") resolveApproval(step.id, false);
            else if (step.state === "pending-options") resolveOptions(step.id, []);
          }
          complete(command, true);
          break;
        }
      }
    }
  }, [convex, host?.commands]);

  // Open the chat a remote prompt is for, so PlanView can send it.
  const [inbox] = useRunSlot(remoteInboxSlot);
  useEffect(() => {
    const next = inbox[0];
    if (!next) return;
    if (workspace.activeTab !== "kode") {
      workspace.setActiveTab("kode");
      return;
    }
    if (workspace.activeChatId !== next.chatId) workspace.selectChat(next.chatId);
  }, [inbox, workspace]);

  // A prompt whose chat never shows up here (deleted, or still syncing after a
  // minute) would block the ones behind it: fail it so the sender knows.
  useEffect(() => {
    if (inbox.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const known = new Set(workspaceRef.current.kodeChats.map((chat) => chat.id));
      const stale = remoteInboxSlot.get().filter((item) => !known.has(item.chatId) && now - item.receivedAt > STALE_SEND_MS);
      if (stale.length === 0) return;
      remoteInboxSlot.set((list) => list.filter((item) => !stale.includes(item)));
      for (const item of stale) finish?.(item.commandId, false, "That thread isn't on this computer.");
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [inbox.length]);

  // ── Mirror runs ──────────────────────────────────────────────────────────
  const watchersRef = useRef<{ chatId: string; until: number }[]>([]);
  watchersRef.current = host?.watchers ?? [];
  const [mirrorTick, setMirrorTick] = useState(0);
  useEffect(() => {
    // Runtime changes (approvals, questions) come through React state.
    setMirrorTick((tick) => tick + 1);
  }, [runtime.pendingByChat, runtime.statusByChat, host?.watchers]);

  const published = useRef(new Map<string, { signature: string; text: string; pending: string[]; status: string; at: number }>());
  const timers = useRef(new Map<string, number>());
  const awake = useRef(false);

  useEffect(() => {
    if (!enabled || !registered) {
      if (awake.current) {
        awake.current = false;
        void invoke("kode_keep_awake", { on: false }).catch(() => {});
      }
      return;
    }

    const isWatched = (chatId: string) => {
      const now = Date.now();
      return watchersRef.current.some((watcher) => watcher.chatId === chatId && watcher.until > now);
    };
    const chatTitle = (chatId: string) =>
      workspaceRef.current.kodeChats.find((chat) => chat.id === chatId)?.title ?? "Kode chat";

    const publish = (chatId: string, view: RemoteRunView) => {
      const before = published.current.get(chatId);
      const pendingIds = view.pending.map((item) => item.id);
      const fresh = view.pending.filter((item) => !before?.pending.includes(item.id));
      const away = idleFor() >= AWAY_MS || !document.hasFocus();
      let notify: { title: string; body: string } | undefined;
      if (fresh.length > 0 && (remoteStarted.has(chatId) || away)) {
        const first = fresh[0]!;
        notify = {
          title: first.kind === "approval" ? "Kode needs your OK" : "Kode has a question",
          body: `${chatTitle(chatId)}: ${first.title}`,
        };
      } else if (view.status === "idle" && before && before.status !== "idle" && (remoteStarted.has(chatId) || away)) {
        notify = { title: "Kode finished", body: chatTitle(chatId) };
      }
      if (view.status === "idle") remoteStarted.delete(chatId);
      // The reply streams only while someone has the chat open remotely.
      const text = isWatched(chatId) || view.status !== "running" ? view.text : "";
      published.current.set(chatId, {
        signature: runSignature(view),
        text,
        pending: pendingIds,
        status: view.status,
        at: Date.now(),
      });
      if (view.status === "idle") published.current.delete(chatId);
      void convex
        .mutation(remoteApi.kodeRemote.publishRun, {
          deviceId: id,
          chatId,
          status: view.status,
          text,
          steps: view.steps,
          pending: view.pending,
          modelId: view.modelId,
          notify,
        })
        .catch(() => {
          // A chat id that isn't saved yet, or a dropped connection: the next change retries.
        });
    };

    const schedule = (chatId: string, delay: number) => {
      if (timers.current.has(chatId)) return;
      timers.current.set(
        chatId,
        window.setTimeout(() => {
          timers.current.delete(chatId);
          evaluate();
        }, delay),
      );
    };

    const evaluate = () => {
      const sending = sendingSlot.get();
      const pending = pendingSlot.get();
      const { pendingByChat } = runtimeRef.current;
      const chats = new Set<string>([
        ...Object.keys(sending).filter((key) => sending[key]),
        ...Object.keys(pendingByChat).filter((key) => (pendingByChat[key]?.length ?? 0) > 0),
        ...published.current.keys(),
      ]);
      chats.delete("draft");
      let active = false;
      for (const chatId of chats) {
        const view = remoteRunView(pending[chatId], Boolean(sending[chatId]), pendingByChat[chatId]);
        if (view.status !== "idle") active = true;
        const before = published.current.get(chatId);
        const now = Date.now();
        if (!before || before.signature !== runSignature(view)) {
          if (before && now - before.at < STATUS_THROTTLE_MS) schedule(chatId, STATUS_THROTTLE_MS);
          else publish(chatId, view);
        } else if (before.text !== view.text && isWatched(chatId)) {
          if (now - before.at < TEXT_THROTTLE_MS) schedule(chatId, TEXT_THROTTLE_MS - (now - before.at));
          else publish(chatId, view);
        }
      }
      if (active !== awake.current) {
        awake.current = active;
        void invoke("kode_keep_awake", { on: active }).catch(() => {});
      }
    };

    evaluate();
    const offPending = pendingSlot.subscribe(evaluate);
    const offSending = sendingSlot.subscribe(evaluate);
    return () => {
      offPending();
      offSending();
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, [convex, enabled, registered, id, mirrorTick]);

  // Turning remote control off (or signing out) lets the computer sleep again.
  useEffect(
    () => () => {
      if (awake.current) void invoke("kode_keep_awake", { on: false }).catch(() => {});
    },
    [],
  );

  return null;
}

/** Settings → Remote control: switch it on or off. */
export function setRemoteControl(on: boolean) {
  updateSettings({ remoteControl: on });
}

export function remoteControlOn(): boolean {
  return getSettings().remoteControl;
}
