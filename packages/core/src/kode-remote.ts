// Kode remote control: the desktop app runs Kode on your computer, and the
// mobile and web apps steer it through Convex (convex/kodeRemote.ts). Shared
// by the backend, the desktop host and both remote clients.

/** A computer counts as online while its last heartbeat is this recent. */
export const KODE_REMOTE_ONLINE_WINDOW_MS = 75_000;
/** How often the desktop app reports that it is online. */
export const KODE_REMOTE_HEARTBEAT_MS = 30_000;
/** A remote viewer keeps a chat "watched" this long per refresh. */
export const KODE_REMOTE_WATCH_MS = 45_000;
/** How often an open remote chat refreshes its watch. */
export const KODE_REMOTE_WATCH_REFRESH_MS = 20_000;
/** A prompt waits this long for an offline or busy computer. */
export const KODE_REMOTE_SEND_TTL_MS = 10 * 60_000;
/** Approvals, answers and Stop go stale quickly. */
export const KODE_REMOTE_ACTION_TTL_MS = 3 * 60_000;
/** Most of the live reply sent to remote viewers (its newest part). */
export const KODE_REMOTE_MAX_LIVE_TEXT = 12_000;
export const KODE_REMOTE_MAX_PROMPT = 20_000;
export const KODE_REMOTE_MAX_PENDING_COMMANDS = 30;

/** Permission modes a remote prompt may use. Auto and Full access stay on
 *  the computer: from a phone, every command and edit still asks you. */
export const KODE_REMOTE_MODES = [
	{
		id: "supervised",
		label: "Supervised",
		description: "Asks before edits and commands",
	},
	{
		id: "auto_edits",
		label: "Auto edits",
		description: "Edits files, asks before commands",
	},
	{
		id: "plan",
		label: "Plan",
		description: "Reads and proposes a plan, changes nothing",
	},
] as const;

export type KodeRemoteMode = (typeof KODE_REMOTE_MODES)[number]["id"];
export const KODE_REMOTE_DEFAULT_MODE: KodeRemoteMode = "supervised";

export function isKodeRemoteMode(value: unknown): value is KodeRemoteMode {
	return KODE_REMOTE_MODES.some((mode) => mode.id === value);
}

export type KodeRemoteRunStatus = "running" | "awaiting" | "idle";

export type KodeRemoteOption = {
	value: string;
	label: string;
	description?: string;
};

export type KodeRemoteQuestion = {
	question: string;
	/** "choice" | "multi" | "text" | "confirm" */
	kind?: string;
	options: KodeRemoteOption[];
	allowOther?: boolean;
	placeholder?: string;
};

/** Something the run is waiting on: a tool approval or a question. */
export type KodeRemotePending = {
	id: string;
	kind: "approval" | "question";
	title: string;
	detail?: string;
	questions?: KodeRemoteQuestion[];
};

export type KodeRemoteStep = {
	id: string;
	name: string;
	label: string;
	state: string;
};

export function isDeviceOnline(
	lastSeenAt: number | null | undefined,
	now = Date.now(),
): boolean {
	return (
		typeof lastSeenAt === "number" &&
		now - lastSeenAt < KODE_REMOTE_ONLINE_WINDOW_MS
	);
}

/** "Online", "Seen 5m ago", … for a device row. */
export function deviceSeenLabel(
	lastSeenAt: number | null | undefined,
	now = Date.now(),
): string {
	if (isDeviceOnline(lastSeenAt, now)) return "Online";
	if (typeof lastSeenAt !== "number") return "Offline";
	const minutes = Math.floor((now - lastSeenAt) / 60_000);
	if (minutes < 60) return `Seen ${Math.max(1, minutes)}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `Seen ${hours}h ago`;
	return `Seen ${Math.floor(hours / 24)}d ago`;
}

const STEPS_BLOCK = /```kode-steps\n([\s\S]*?)\n```\n*/g;
const IMAGE_BLOCK = /\n*```kode-image\n[\s\S]*?\n```/g;

/**
 * A saved Kode message for a remote viewer: the reply text plus the tool
 * steps the desktop saved in front of it (```kode-steps, desktop
 * lib/kode-steps.ts).
 */
export function parseKodeRemoteMessage(content: string): {
	text: string;
	steps: KodeRemoteStep[];
} {
	const steps: KodeRemoteStep[] = [];
	const text = content
		.replace(STEPS_BLOCK, (_, json: string) => {
			try {
				const data = JSON.parse(json) as unknown;
				if (Array.isArray(data)) {
					data.forEach((raw, index) => {
						if (!raw || typeof raw !== "object") return;
						const step = raw as Record<string, unknown>;
						const name = typeof step.name === "string" ? step.name : "";
						if (!name) return;
						steps.push({
							id: typeof step.id === "string" ? step.id : `saved-${index}`,
							name,
							label:
								typeof step.description === "string" && step.description
									? step.description
									: name,
							state: typeof step.state === "string" ? step.state : "done",
						});
					});
				}
			} catch {
				// A malformed block shows as nothing rather than raw JSON.
			}
			return "";
		})
		.replace(IMAGE_BLOCK, "\n[Image]")
		.trim();
	return { text, steps };
}

/** A new chat's title from its first prompt. */
export function remoteChatTitle(prompt: string): string {
	const line = prompt.trim().split("\n")[0]?.replace(/\s+/g, " ") ?? "";
	if (!line) return "New chat";
	return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

/** Keep the newest part of a long live reply. */
export function liveTextTail(text: string): string {
	if (text.length <= KODE_REMOTE_MAX_LIVE_TEXT) return text;
	return `…${text.slice(-KODE_REMOTE_MAX_LIVE_TEXT)}`;
}

/** One question's answer as the remote UI holds it. */
export type KodeRemoteDraftAnswer = { picked: string[]; text: string };

/**
 * The values to send for a pending question, in the shape the desktop's own
 * prompt sends (KodeComposerPrompt.tsx): a single question sends its picked
 * values (plus "other" text), a form sends one answer per question.
 */
export function buildRemoteAnswer(
	questions: KodeRemoteQuestion[],
	answers: Record<number, KodeRemoteDraftAnswer | undefined>,
): string[] {
	if (questions.length > 1) {
		return questions
			.map((_, index) => {
				const answer = answers[index];
				return (answer?.picked[0] ?? answer?.text ?? "").trim();
			})
			.filter(Boolean);
	}
	const question = questions[0];
	const answer = answers[0];
	if (!question || !answer) return [];
	const text = answer.text.trim();
	if (question.kind === "text") return text ? [text] : [];
	return text && question.allowOther ? [...answer.picked, text] : answer.picked;
}
