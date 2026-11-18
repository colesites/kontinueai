// The /api/chat request contract, shared by the web and Expo clients so the
// body the route receives cannot drift between them. Framework-free: no DOM,
// no React Native, no AI SDK runtime import.

export type ChatRequestBodyState = {
	selectedModel: string;
	webSearchEnabled: boolean;
	reasoningEnabled?: boolean;
	imageAspectRatio: string;
	imageSize: string | null;
	agentId?: string | null;
};

export type ChatRequestBody = {
	chatId: string;
	model: string;
	webSearchEnabled: boolean;
	reasoningEnabled?: boolean;
	imageAspectRatio: string;
	imageSize: string | null;
	userTimezone: string | null;
	agentId: string | null;
};

function getClientTimezone(): string | null {
	if (typeof Intl === "undefined") return null;
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
}

export function toChatRequestBody(
	state: ChatRequestBodyState,
	chatId: string,
): ChatRequestBody {
	return {
		chatId,
		model: state.selectedModel,
		webSearchEnabled: state.webSearchEnabled,
		reasoningEnabled: state.reasoningEnabled,
		imageAspectRatio: state.imageAspectRatio,
		imageSize: state.imageSize,
		userTimezone: getClientTimezone(),
		agentId: state.agentId ?? null,
	};
}

/**
 * Retrying an assistant turn regenerates from the user message that produced
 * it, so everything after that user message is dropped first.
 */
export function trimMessagesToRetryTarget<
	T extends { id: string; role: string },
>(messages: T[], retryMessageId: string): T[] {
	const targetIndex = messages.findIndex(
		(message) => message.id === retryMessageId,
	);
	// Same window as `slice(0, targetIndex)`, including its -1 behaviour.
	const end = targetIndex === -1 ? messages.length - 1 : targetIndex;
	let userIndex = -1;
	for (let i = end - 1; i >= 0; i--) {
		if (messages[i]?.role === "user") {
			userIndex = i;
			break;
		}
	}
	return userIndex === -1 ? messages : messages.slice(0, userIndex + 1);
}

const PAID_PLAN_REQUIRED_PATTERN =
	/starter or pro plan required|starter plan required|pro plan required|requires pro|paid plan required/i;
const UNAUTHORIZED_PATTERN = /unauthorized|not signed in|status\s*401/i;
const INPUT_TOO_LONG_PATTERN =
	/input_too_long|message is too long|too long for this model|input tokens|too many tokens|max input tokens/i;
const AI_UNAVAILABLE_PATTERN =
	/temporarily unavailable|service is unavailable|try again in a little while/i;
const MODEL_UNAVAILABLE_PATTERN =
	/model isn.?t available|switch to a different model|no_providers_available|do not have access to this model/i;
const RATE_LIMITED_PATTERN = /too many requests|rate.?limit|model is busy/i;
const MESSAGE_LIMIT_PATTERN = /message limit|usage limit/i;
const SERVER_ERROR_PATTERN = /something went wrong on our end/i;

export type ChatErrorKind =
	| "plan"
	| "limit"
	| "model"
	| "busy"
	| "unavailable"
	| "auth"
	| "too-long"
	| "server"
	| "unknown";

export type ChatErrorToast = { title: string; description: string };

// Checked in order: the first pattern that matches decides the message.
const CHAT_ERRORS: Array<{
	kind: Exclude<ChatErrorKind, "unknown">;
	pattern: RegExp;
	toast: ChatErrorToast;
}> = [
	{
		kind: "plan",
		pattern: PAID_PLAN_REQUIRED_PATTERN,
		toast: {
			title: "This model requires a paid plan.",
			description: "Choose a free model or upgrade to Starter/Pro.",
		},
	},
	{
		kind: "limit",
		pattern: MESSAGE_LIMIT_PATTERN,
		toast: {
			title: "Message limit reached.",
			description: "Upgrade your plan or try again later.",
		},
	},
	{
		kind: "model",
		pattern: MODEL_UNAVAILABLE_PATTERN,
		toast: {
			title: "Model unavailable.",
			description: "Switch to a different model and try again.",
		},
	},
	{
		kind: "busy",
		pattern: RATE_LIMITED_PATTERN,
		toast: {
			title: "This model is busy.",
			description:
				"It's rate limited right now — wait a few seconds, or switch to another model.",
		},
	},
	{
		kind: "unavailable",
		pattern: AI_UNAVAILABLE_PATTERN,
		toast: {
			title: "AI temporarily unavailable.",
			description:
				"We couldn't reach the AI service. Please try again shortly.",
		},
	},
	{
		kind: "auth",
		pattern: UNAUTHORIZED_PATTERN,
		toast: {
			title: "You're not signed in.",
			description: "Please refresh and sign in again.",
		},
	},
	{
		kind: "too-long",
		pattern: INPUT_TOO_LONG_PATTERN,
		toast: {
			title: "Message too long.",
			description: "Shorten your message and try again.",
		},
	},
	{
		kind: "server",
		pattern: SERVER_ERROR_PATTERN,
		toast: {
			title: "Something went wrong.",
			description: "An unexpected error occurred. Please try again.",
		},
	},
];

/** What went wrong, so a client can offer the matching fix. */
export function getChatErrorKind(message: string): ChatErrorKind {
	return (
		CHAT_ERRORS.find((entry) => entry.pattern.test(message))?.kind ?? "unknown"
	);
}

export function getChatErrorToast(message: string): ChatErrorToast {
	const match = CHAT_ERRORS.find((entry) => entry.pattern.test(message));
	if (match) return { ...match.toast };
	return { title: "AI didn’t respond.", description: message };
}
