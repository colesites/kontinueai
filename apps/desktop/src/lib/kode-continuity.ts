// Mirrors the desktop's continuity data to Convex (convex/kodeContinuity.ts):
// which local agent session continues each chat, and prompts scheduled to
// send later. The local copies stay the working ones (fast, and offline);
// Convex keeps a reinstall or a second computer from losing them.
//
// Every call here tolerates failure: offline, signed out, or a backend that
// doesn't have these functions yet just means nothing is mirrored this time.

import { invoke } from "@tauri-apps/api/core";
import { useConvex, useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { continuityApi as api, type MirroredScheduledPrompt } from "./convex-api";
import { getCliSession, onCliSessionSaved, saveCliSession } from "./kode-cli";
import {
  getScheduledPrompts,
  mergeScheduledPrompts,
  subscribeScheduledPrompts,
  type ScheduledPrompt,
} from "./kode-schedule";
import type { KodeAgentMode } from "./kode-tools";

type Client = ReturnType<typeof useConvex>;

let devicePromise: Promise<string> | null = null;
/** This computer's name; agent sessions can only be resumed where they ran. */
export function deviceName(): Promise<string> {
  devicePromise ??= invoke<string>("kode_device_name").catch(() => "this computer");
  return devicePromise;
}

// Scheduled prompts this session has put in Convex (id → fireAt it holds).
const mirrored = new Map<string, number>();
// Client for claims outside React; set while the sync hook is mounted.
let activeClient: Client | null = null;

function toMirror(item: ScheduledPrompt): MirroredScheduledPrompt {
  return {
    localId: item.id,
    chatId: item.chatId,
    chatTitle: item.chatTitle ?? undefined,
    text: item.text,
    modelId: item.modelId,
    mode: item.mode,
    reason: item.reason,
    fireAt: item.fireAt,
    createdAt: item.createdAt,
  };
}

function fromMirror(item: MirroredScheduledPrompt): ScheduledPrompt {
  return {
    id: item.localId,
    chatId: item.chatId,
    chatTitle: item.chatTitle ?? null,
    text: item.text,
    modelId: item.modelId,
    mode: item.mode as KodeAgentMode,
    fireAt: item.fireAt,
    createdAt: item.createdAt,
    reason: item.reason === "limit" || item.reason === "pr" ? item.reason : "manual",
  };
}

/** Put local queue changes into Convex: new or moved prompts, and removals. */
async function pushSchedule(client: Client) {
  const current = getScheduledPrompts();
  const ids = new Set(current.map((item) => item.id));
  for (const item of current) {
    if (mirrored.get(item.id) === item.fireAt) continue;
    try {
      await client.mutation(api.kodeContinuity.upsertScheduledPrompt, toMirror(item));
      mirrored.set(item.id, item.fireAt);
    } catch {
      // A draft or deleted chat, or no backend support: stays local.
    }
  }
  for (const id of [...mirrored.keys()]) {
    if (ids.has(id)) continue;
    mirrored.delete(id);
    void client.mutation(api.kodeContinuity.removeScheduledPrompt, { localId: id }).catch(() => {});
  }
}

/**
 * Before sending a due prompt: false when another computer already took it.
 * A prompt Convex never had (offline when queued) is this computer's to send.
 */
export async function claimScheduledPrompt(item: ScheduledPrompt): Promise<boolean> {
  const client = activeClient;
  if (!client) return true;
  try {
    const result = await client.mutation(api.kodeContinuity.claimScheduledPrompt, {
      localId: item.id,
      device: await deviceName(),
    });
    if (result === "taken") return false;
    // Mirrored earlier and now gone: another computer sent (and removed) it.
    if (result === "missing" && mirrored.has(item.id)) return false;
    return true;
  } catch {
    return true;
  }
}

/** Mount once (ViewLayout): restore from Convex, then mirror changes to it. */
export function useContinuitySync() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    activeClient = convex;
    let cancelled = false;

    void (async () => {
      const device = await deviceName();
      // Sessions recorded on this computer that local storage lost.
      const sessions = await convex.query(api.kodeContinuity.listCliSessions, {}).catch(() => []);
      for (const session of sessions) {
        if (cancelled) return;
        if (session.device !== device) continue;
        if (!getCliSession(session.chatId, session.instanceId)) {
          saveCliSession(session.chatId, session.instanceId, session.sessionId, { silent: true });
        }
      }
      // Prompts queued here or on another computer that aren't in this queue.
      const remote = await convex.query(api.kodeContinuity.listScheduledPrompts, {}).catch(() => []);
      if (cancelled) return;
      for (const item of remote) mirrored.set(item.localId, item.fireAt);
      mergeScheduledPrompts(remote.map(fromMirror));
      await pushSchedule(convex);
    })();

    const stopSessions = onCliSessionSaved((chatId, instanceId, sessionId) => {
      void deviceName().then((device) =>
        convex.mutation(api.kodeContinuity.saveCliSession, { chatId, instanceId, sessionId, device }).catch(() => {}),
      );
    });
    let pushing: Promise<void> = Promise.resolve();
    const stopSchedule = subscribeScheduledPrompts(() => {
      pushing = pushing.then(() => pushSchedule(convex));
    });

    return () => {
      cancelled = true;
      stopSessions();
      stopSchedule();
      if (activeClient === convex) activeClient = null;
    };
  }, [convex, isAuthenticated]);
}
