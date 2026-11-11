// A running Kode turn is checkpointed to local storage about once a second,
// so quitting (or a crash) mid-reply doesn't lose it: on the next launch the
// unfinished reply is saved into its chat with a note saying it stopped.
//
// Local storage is written synchronously, so the last checkpoint survives the
// window closing. The user's message is already saved when the turn starts.

const STORAGE_KEY = "kontinue.kode.inflight";
const MAX_CHARS = 200_000;

export type TurnCheckpoint = {
  chatId: string;
  /** The user's message, when it wasn't saved yet. */
  userText?: string;
  /** The reply so far, with its steps (withSteps format). */
  reply: string;
  todos?: { title: string; description?: string; status: string }[];
  modelId?: string;
  at: number;
};

function load(): Record<string, TurnCheckpoint> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, TurnCheckpoint>;
  } catch {
    return {};
  }
}

function save(all: Record<string, TurnCheckpoint>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the turn just isn't recoverable.
  }
}

export function writeCheckpoint(checkpoint: TurnCheckpoint) {
  const all = load();
  all[checkpoint.chatId] = { ...checkpoint, reply: checkpoint.reply.slice(0, MAX_CHARS) };
  save(all);
}

export function clearCheckpoint(chatId: string) {
  const all = load();
  if (!(chatId in all)) return;
  delete all[chatId];
  save(all);
}

/** Checkpoints left by a previous run of the app, except chats running now. */
export function leftoverCheckpoints(running: (chatId: string) => boolean): TurnCheckpoint[] {
  return Object.values(load()).filter((checkpoint) => !running(checkpoint.chatId));
}

/** Calls `write` at most every `ms`, always with the latest value. */
export function throttle(write: () => void, ms = 1_000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, ms);
  };
}
