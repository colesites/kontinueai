"use node";

import { createGateway, generateText } from "@repo/ai";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v1";
const FIRECRAWL_WAIT_FOR_MS = 5000;
const SCRAPE_MAX_RETRIES = 3;
const SCRAPE_RETRY_DELAY_MS = 3000;
const NORMALIZER_CHUNK_CHAR_LIMIT = 18_000;

type ParsedMessage = { role: "user" | "assistant"; content: string };
type ImportProgressReporter = (percent: number, stage: string) => Promise<void>;
type ChunkProgressReporter = (
	completedChunks: number,
	totalChunks: number,
) => Promise<void>;

// ============================================================================
// SYSTEM PROMPT FOR CHAT NORMALIZATION
// ============================================================================

const NORMALIZER_SYSTEM_PROMPT = `You are a strict chat transcript normalizer.
Your goal is to extract ONLY the conversation between the User and the AI from a raw web scrape.

INPUT: Raw markdown that may contain:
- Headers (e.g., "Chat with Gemini", "Claude - My Chat")
- Footers (copyright, terms, links)
- UI Chrome (buttons like "Copy", "Regenerate", "Share", "Sign in")
- Metadata (timestamps, model names)

OUTPUT: A strict sequence of messages in this EXACT format:

[USER]:
<user message content>

[ASSISTANT]:
<ai response content>

RULES:
1.  **REMOVE ALL HEADERS & FOOTERS**: Delete anything that is not part of the actual conversation flow.
2.  **REMOVE UI TEXT**: Delete "Copy code", "Regenerate response", "Share", "bad/good response" buttons text.
3.  **STRICT ROLES**: 
    - The person asking questions is [USER].
    - The AI answering is [ASSISTANT].
    - Look for specific markers like "You said:", "ChatGPT said:", "User:", "Assistant:", "Gemini:", "Perplexity:" to identify who is speaking.
    - If markers are unclear, strictly alternate between [USER] and [ASSISTANT] starting with [USER].
    - [USER] messages usually come first.
    - [ASSISTANT] messages usually follow.
    - **ATTACHMENT LABELS**: A bare line like "Uploaded an image", "Uploaded a file", "Attached document" or "Screenshot" is the share page's placeholder for something the USER attached. It ALWAYS begins a new [USER] turn — never leave it inside an [ASSISTANT] message. Keep the label text and attach the question that follows it to the same [USER] turn.
    - **NEVER SWALLOW A QUESTION**: If a short question or instruction appears in the middle of a long answer and the text after it reads like a fresh reply ("Yes.", "Sure", "Here's...", "I can..."), that question is a [USER] turn. Emit a [USER] marker for it and an [ASSISTANT] marker for the reply.
4.  **PRESERVE CONTENT**: 
    - Keep the actual message content (code blocks, markdown tables, bold text) EXACTLY as is. Do not summarize or rewrite.
    - **IMAGES**: strictly PRESERVE all markdown images in the format ![alt](url). Do NOT remove them.
    - **DIAGRAMS/CODE**: strictly PRESERVE all code blocks and diagrams (Mermaid, ASCII), even if they constitute the entire message.
    - **CLAUDE ARTIFACTS**: Artifacts are part of Claude's assistant response even when the page renders them in a separate panel or labels them as a create_file result. Preserve each artifact's title or filename, type, and COMPLETE source/content. Attach it to the associated [ASSISTANT] message under a heading like "### Claude Artifact: <title>". Keep HTML, React, SVG, Mermaid, code, and documents in an appropriate fenced code block. Never replace an artifact with only "Artifact", "Open artifact", "View artifact", a filename, or a summary.
5.  **NO EXTRA TEXT**: Do not add "Here is the transcript" or "Summary:". Just the bracketed labels and content.
6.  **CODE BLOCKS**: If there is code, keep it inside standard \`\`\` blocks. Do NOT put [USER] or [ASSISTANT] tags *inside* a code block. Ensure language tags (like \`\`\`mermaid\` or \`\`\`typescript\`) are preserved.

EXAMPLE INPUT:
"Chat with Claude
User
Hello there
Claude
Hi! How can I help?
Copy
Regenerate"

EXAMPLE OUTPUT:
[USER]:
Hello there

[ASSISTANT]:
Hi! How can I help?
`;

// ============================================================================
// LLM NORMALIZATION (ALL PROVIDERS)
// ============================================================================

function getLLMModel() {
	const apiKey = process.env.AI_GATEWAY_TOKEN;
	if (!apiKey) {
		throw new Error("AI_GATEWAY_TOKEN is not set");
	}
	const gw = createGateway({ apiKey });
	// `google/gemini-2.0-flash-001` was dropped from the Vercel AI Gateway
	// catalog (404 model_not_found); use a currently-served id.
	const modelId = process.env.MEMORY_GATEWAY_MODEL ?? "google/gemini-2.5-flash";
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return gw(modelId) as any;
}

async function normalizeTranscriptChunkWithLLM(markdownChunk: string) {
	const { text } = await generateText({
		model: getLLMModel(),
		system: NORMALIZER_SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `Please normalize this transcript:\n\n${markdownChunk}`,
			},
		],
		// @ts-expect-error - explicitly supported by Vercel AI SDK even if types lag
		maxTokens: 12288,
	});

	return text.trim();
}

async function normalizeTranscriptChunkWithContext(
	markdownChunk: string,
	continuationRole: "user" | "assistant" | null,
) {
	if (!continuationRole) {
		return normalizeTranscriptChunkWithLLM(markdownChunk);
	}

	const continuationHint = `The previous chunk ended with [${continuationRole.toUpperCase()}]. If this chunk starts mid-message, continue that same role until a clear speaker switch is present.`;

	const { text } = await generateText({
		model: getLLMModel(),
		system: NORMALIZER_SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `${continuationHint}\n\nPlease normalize this transcript:\n\n${markdownChunk}`,
			},
		],
		// @ts-expect-error - explicitly supported by Vercel AI SDK even if types lag
		maxTokens: 12288,
	});

	return text.trim();
}

// ============================================================================
// FAST PARSER + CHUNKING
// ============================================================================

function splitMarkdownIntoChunks(markdown: string, maxChars: number): string[] {
	if (markdown.length <= maxChars) {
		return [markdown];
	}

	const chunks: string[] = [];
	let currentChunk = "";
	const paragraphs = markdown.split(/\n{2,}/);

	const pushCurrentChunk = () => {
		const trimmed = currentChunk.trim();
		if (trimmed) {
			chunks.push(trimmed);
		}
		currentChunk = "";
	};

	for (const paragraph of paragraphs) {
		const trimmedParagraph = paragraph.trim();
		if (!trimmedParagraph) continue;

		const candidate = currentChunk
			? `${currentChunk}\n\n${trimmedParagraph}`
			: trimmedParagraph;

		if (candidate.length <= maxChars) {
			currentChunk = candidate;
			continue;
		}

		pushCurrentChunk();

		if (trimmedParagraph.length <= maxChars) {
			currentChunk = trimmedParagraph;
			continue;
		}

		for (let i = 0; i < trimmedParagraph.length; i += maxChars) {
			chunks.push(trimmedParagraph.slice(i, i + maxChars).trim());
		}
	}

	pushCurrentChunk();

	if (chunks.length === 0) {
		return [markdown];
	}

	return chunks;
}

function mergeAdjacentSameRoleMessages(
	messages: ParsedMessage[],
): ParsedMessage[] {
	const merged: ParsedMessage[] = [];
	for (const message of messages) {
		const content = message.content.trim();
		if (!content) continue;
		const previous = merged[merged.length - 1];
		if (!previous || previous.role !== message.role) {
			merged.push({ role: message.role, content });
			continue;
		}
		previous.content = `${previous.content}\n\n${content}`.trim();
	}
	return merged;
}

function chunkStartsWithExplicitSpeaker(chunk: string): boolean {
	const lines = chunk
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 8);

	for (const line of lines) {
		if (/^\[(?:user|assistant)\]:/i.test(line)) {
			return true;
		}

		const roleMatch = line.match(ROLE_HEADER_REGEX);
		if (roleMatch) {
			if (normalizeRoleLabel(roleMatch[1])) {
				return true;
			}
			if (isLikelyColonSpeakerLabel(roleMatch[1])) {
				return true;
			}
		}

		if (
			resolveStandaloneRoleLine(line) ||
			extractStandaloneSpeakerLabel(line)
		) {
			return true;
		}

		if (/^```/.test(line)) {
			break;
		}
	}

	return false;
}

function looksLikeUserPrompt(content: string): boolean {
	const trimmed = content.trim();
	if (!trimmed) return false;

	if (
		/^(can|could|would|should|please|what|why|how|when|where|who|write|give|show|help|create|generate|explain|tell|summarize|fix)\b/i.test(
			trimmed,
		)
	) {
		return true;
	}

	if (trimmed.length <= 500 && /\?\s*$/.test(trimmed)) {
		return true;
	}

	return false;
}

function looksLikeAssistantContinuation(content: string): boolean {
	const trimmed = content.trim();
	if (!trimmed) return false;

	if (/^([,.;:)\]-]|\d+\.\s|[-*]\s|```|>)/.test(trimmed)) {
		return true;
	}
	if (/^[a-z]/.test(trimmed) && trimmed.length > 120) {
		return true;
	}
	if (trimmed.length > 600 && !looksLikeUserPrompt(trimmed)) {
		return true;
	}

	return false;
}

// Share pages render an uploaded attachment as a bare label rather than an
// image the scraper can reach ("Uploaded an image" on ChatGPT). The label is
// the user's turn, so it marks where an assistant message was wrongly extended.
const ATTACHMENT_MARKER_REGEX =
	/^(?:uploaded|attached|shared)\s+(?:an?|\d+|the)?\s*(?:image|images|photo|photos|picture|pictures|file|files|document|documents|screenshot|screenshots|pdf)\b[.!]?$/i;

// A markdown image, or a bare filename, standing on its own line.
const STANDALONE_ATTACHMENT_LINE_REGEX =
	/^(?:!\[[^\]]*\]\([^)]*\)|\[?[\w .-]+\.(?:png|jpe?g|gif|webp|heic|svg|pdf|csv|xlsx?|docx?|txt|md|zip)\]?)$/i;

function isAttachmentLine(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed) return false;
	return (
		ATTACHMENT_MARKER_REGEX.test(trimmed) ||
		STANDALONE_ATTACHMENT_LINE_REGEX.test(trimmed)
	);
}

// Providers put the speaker label first and the message after it — except for
// attachments, which several platforms emit ABOVE the label of the turn they
// belong to. Parsing strictly by label therefore files the attachment under the
// PREVIOUS speaker. At every role boundary, hand any trailing attachment lines
// forward to the turn that is starting.
//
// Mutates `parts` (removing what it hands over) and returns the moved lines.
// Never empties the previous turn: a message that is only an attachment is a
// real message belonging to that speaker, not a mislabelled one.
export function detachTrailingAttachmentLines(parts: string[]): string[] {
	let cut = parts.length;
	let sawAttachment = false;

	for (let index = parts.length - 1; index >= 0; index -= 1) {
		const line = (parts[index] ?? "").trim();
		if (!line) {
			cut = index;
			continue;
		}
		if (!isAttachmentLine(line)) break;
		sawAttachment = true;
		cut = index;
	}

	if (!sawAttachment) return [];

	// An unterminated code fence means these lines are inside a code block.
	const remaining = parts.slice(0, cut);
	const fenceCount = remaining.filter((line) =>
		/^```/.test(line.trim()),
	).length;
	if (fenceCount % 2 !== 0) return [];
	if (!remaining.join("\n").trim()) return [];

	const moved = parts.slice(cut).filter((line) => line.trim());
	parts.length = cut;
	return moved;
}

// Openers an assistant reply starts with when answering a fresh question. Used
// as the closing boundary of an embedded user turn.
const ASSISTANT_OPENER_REGEX =
	/^(?:yes|yep|no|nope|sure|absolutely|certainly|of course|got it|understood|here(?:'s| is| are)|i can|i'll|i will|i'd|i've|great question|good question|short answer|happy to)\b/i;

function isStructuralLine(line: string): boolean {
	return /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```)/.test(line);
}

// The LLM normalizer sometimes fails to emit a [USER] marker for a turn in the
// middle of a chunk, which silently glues the user's prompt onto the end of the
// preceding assistant message. `repairLikelyRoleDrift` can't recover that (it
// works per message, and the message as a whole still looks like an assistant
// turn), so pull the embedded prompt back out into its own user message.
export function splitEmbeddedUserTurns(
	messages: ParsedMessage[],
): ParsedMessage[] {
	const result: ParsedMessage[] = [];

	for (const message of messages) {
		if (message.role !== "assistant") {
			result.push(message);
			continue;
		}

		const lines = message.content.split(/\r?\n/);
		let inCodeFence = false;
		let start = -1;
		let end = -1;

		for (let index = 1; index < lines.length; index += 1) {
			const line = (lines[index] ?? "").trim();
			if (/^```/.test(line)) {
				inCodeFence = !inCodeFence;
				continue;
			}
			if (inCodeFence || !line || isStructuralLine(line)) continue;

			const isCandidate =
				ATTACHMENT_MARKER_REGEX.test(line) ||
				(line.length <= 300 &&
					looksLikeUserPrompt(line) &&
					!looksLikeAssistantContinuation(line));
			if (!isCandidate) continue;

			// Only split when the assistant visibly resumes afterwards — without a
			// closing boundary this is far more likely to be the assistant echoing a
			// question back than a real user turn. Look a few lines ahead so an
			// attachment label followed by the actual question still matches.
			let scanned = 0;
			for (let after = index + 1; after < lines.length; after += 1) {
				const candidateEnd = (lines[after] ?? "").trim();
				if (!candidateEnd) continue;
				if (/^```/.test(candidateEnd) || isStructuralLine(candidateEnd)) break;
				if (ASSISTANT_OPENER_REGEX.test(candidateEnd)) {
					start = index;
					end = after;
					break;
				}
				scanned += 1;
				if (scanned >= 3) break;
			}

			if (start !== -1) break;
		}

		if (start === -1 || end === -1) {
			result.push(message);
			continue;
		}

		const before = lines.slice(0, start).join("\n").trim();
		const embedded = lines.slice(start, end).join("\n").trim();
		const after = lines.slice(end).join("\n").trim();

		if (!before || !embedded || !after) {
			result.push(message);
			continue;
		}

		result.push({ role: "assistant", content: before });
		result.push({ role: "user", content: embedded });
		result.push({ role: "assistant", content: after });
	}

	return result;
}

function repairLikelyRoleDrift(messages: ParsedMessage[]): ParsedMessage[] {
	const repaired = messages
		.map((message) => ({
			role: message.role,
			content: message.content.trim(),
		}))
		.filter((message) => Boolean(message.content));

	for (let index = 0; index < repaired.length; index += 1) {
		const previous = repaired[index - 1];
		const current = repaired[index];
		const next = repaired[index + 1];

		if (!current) continue;

		// Assistant → user: `shouldForceContinuationRole` stamps a chunk's first
		// message with the previous chunk's role, so a user turn that happens to
		// land on a chunk boundary gets absorbed into the assistant side. A short
		// prompt sandwiched between two assistant messages is that failure.
		if (
			current.role === "assistant" &&
			previous?.role === "assistant" &&
			(next === undefined || next.role === "assistant") &&
			current.content.length <= 300 &&
			looksLikeUserPrompt(current.content) &&
			!looksLikeAssistantContinuation(current.content)
		) {
			current.role = "user";
			continue;
		}

		if (current.role !== "user" || previous?.role !== "assistant") {
			continue;
		}

		const hasSuspiciousPattern =
			next?.role === "user" || next === undefined || next?.role === "assistant";

		if (!hasSuspiciousPattern) {
			continue;
		}

		const longCandidate = current.content.length >= 180;
		const likelyPrompt = looksLikeUserPrompt(current.content);
		const likelyContinuation = looksLikeAssistantContinuation(current.content);

		if ((longCandidate && !likelyPrompt) || likelyContinuation) {
			current.role = "assistant";
		}
	}

	return mergeAdjacentSameRoleMessages(repaired);
}

async function normalizeTranscriptWithLLM(
	markdown: string,
	onChunkProgress?: ChunkProgressReporter,
): Promise<ParsedMessage[]> {
	const chunks = splitMarkdownIntoChunks(markdown, NORMALIZER_CHUNK_CHAR_LIMIT);
	if (chunks.length === 0) {
		return [];
	}

	const normalizedChunks: string[] = [];
	const parsedMessages: ParsedMessage[] = [];
	let continuationRole: "user" | "assistant" | null = null;

	for (let index = 0; index < chunks.length; index += 1) {
		const chunk = chunks[index];
		if (!chunk) continue;
		const normalizedChunk = await normalizeTranscriptChunkWithContext(
			chunk,
			continuationRole,
		);
		normalizedChunks.push(normalizedChunk);

		const parsedChunk = parseNormalizedTranscript(normalizedChunk).messages;
		const firstParsed = parsedChunk[0];
		if (firstParsed) {
			const shouldForceContinuationRole =
				continuationRole !== null &&
				firstParsed.role !== continuationRole &&
				!chunkStartsWithExplicitSpeaker(chunk);

			if (shouldForceContinuationRole) {
				const forcedRole = continuationRole as "user" | "assistant";
				parsedChunk[0] = {
					...firstParsed,
					role: forcedRole,
				};
			}

			parsedMessages.push(...parsedChunk);
			const merged = mergeAdjacentSameRoleMessages(parsedMessages);
			const last = merged[merged.length - 1];
			continuationRole = last ? last.role : continuationRole;
		}

		if (onChunkProgress) {
			await onChunkProgress(index + 1, chunks.length);
		}
	}

	const mergedParsed = repairLikelyRoleDrift(
		splitEmbeddedUserTurns(mergeAdjacentSameRoleMessages(parsedMessages)),
	);
	if (mergedParsed.length > 0) {
		return mergedParsed;
	}

	const fallbackNormalizedText = normalizedChunks.join("\n\n").trim();
	return mergeAdjacentSameRoleMessages(
		parseNormalizedTranscript(fallbackNormalizedText).messages,
	);
}

const USER_LABELS = new Set([
	"user",
	"you",
	"human",
	"me",
	"question",
	"prompt",
]);

const ASSISTANT_LABELS = new Set([
	"assistant",
	"chatgpt",
	"claude",
	"gemini",
	"perplexity",
	"ai",
	"bot",
	"model",
]);

const ROLE_HEADER_REGEX =
	/^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*([a-z][a-z0-9 _\-/.()]{1,48})(?:\*\*)?\s*[:：]\s*(.*)$/i;

const STANDALONE_ROLE_LINE_ALLOWED_TOKENS = new Set([
	...USER_LABELS,
	...ASSISTANT_LABELS,
	"said",
]);

const NON_SPEAKER_LABEL_TOKENS = new Set([
	"copy",
	"share",
	"regenerate",
	"edit",
	"delete",
	"retry",
	"export",
	"download",
	"continue",
	"sources",
	"reasoning",
	"search",
	"prompt",
	"response",
	"feedback",
	"like",
	"dislike",
	"signin",
	"sign",
	"login",
]);

type FirecrawlExtractionResult = {
	title: string;
	messages: ParsedMessage[];
	metadata: unknown;
	timingsMs: {
		total: number;
		firecrawl: number;
		normalization?: number;
	};
	extractionStrategy: "regex" | "normalized_markers" | "llm";
};

type FirecrawlScrapeApiResponse = {
	success?: boolean;
	error?: string;
	data?: {
		markdown?: string;
		metadata?: {
			title?: string;
			[key: string]: unknown;
		} | null;
	};
};

function isClaudeSharedUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return (
			hostname === "claude.ai" ||
			hostname.endsWith(".claude.ai") ||
			hostname === "claude.com" ||
			hostname.endsWith(".claude.com")
		);
	} catch {
		return false;
	}
}

export function buildFirecrawlScrapeRequest(url: string) {
	const isClaude = isClaudeSharedUrl(url);
	return {
		url,
		formats: ["markdown"],
		// Claude renders artifacts beside the conversation rather than inside the
		// message column. Main-content filtering removes that panel entirely.
		onlyMainContent: !isClaude,
		waitFor: isClaude ? 8_000 : FIRECRAWL_WAIT_FOR_MS,
	};
}

function normalizeRoleLabel(
	label: string | undefined,
): "user" | "assistant" | null {
	if (!label) return null;
	const normalized = label
		.toLowerCase()
		.replace(/\*\*/g, "")
		.replace(/[()]/g, " ")
		.replace(/[^\w\s-]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\bsaid\b$/, "")
		.trim();

	const tokens = normalized
		.split(/[ _-]+/)
		.map((token) => token.trim())
		.filter(Boolean);

	if (tokens.some((token) => USER_LABELS.has(token))) return "user";
	if (tokens.some((token) => ASSISTANT_LABELS.has(token))) return "assistant";
	return null;
}

function parseRoleLabeledTranscript(markdown: string): {
	messages: ParsedMessage[];
} {
	const lines = markdown.split(/\r?\n/);
	const messages: ParsedMessage[] = [];
	let currentRole: "user" | "assistant" | null = null;
	let currentParts: string[] = [];
	let inCodeBlock = false;

	const flush = () => {
		if (!currentRole) return;
		const content = currentParts.join("\n").trim();
		if (!content) return;
		messages.push({ role: currentRole, content });
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!inCodeBlock) {
			const roleMatch = line.match(ROLE_HEADER_REGEX);
			if (roleMatch) {
				const nextRole = normalizeRoleLabel(roleMatch[1]);
				if (nextRole) {
					const carried = detachTrailingAttachmentLines(currentParts);
					flush();
					currentRole = nextRole;
					currentParts = carried;
					const inlineContent = roleMatch[2]?.trim();
					if (inlineContent) {
						currentParts.push(inlineContent);
					}
					continue;
				}
			}
		}

		if (currentRole) {
			currentParts.push(line);
		}
		if (/^```/.test(trimmed)) {
			inCodeBlock = !inCodeBlock;
		}
	}

	flush();

	if (messages.length < 2) {
		return { messages: [] };
	}

	const hasUser = messages.some((message) => message.role === "user");
	const hasAssistant = messages.some((message) => message.role === "assistant");
	if (!hasUser || !hasAssistant) {
		return { messages: [] };
	}

	return { messages };
}

function normalizeStandaloneRoleLine(rawLine: string): string {
	return rawLine
		.trim()
		.replace(/^[>\-\s]*/, "")
		.replace(/^(?:#{1,6}\s*)/, "")
		.replace(/\*\*/g, "")
		.replace(/[:：]\s*$/, "")
		.trim();
}

function resolveStandaloneRoleLine(
	rawLine: string,
): "user" | "assistant" | null {
	const normalizedLine = normalizeStandaloneRoleLine(rawLine);
	if (!normalizedLine || normalizedLine.length > 42) {
		return null;
	}
	if (/[.?!]/.test(normalizedLine)) {
		return null;
	}

	const tokens = normalizedLine
		.toLowerCase()
		.replace(/[()]/g, " ")
		.replace(/[^\w\s-]/g, " ")
		.split(/[ _-]+/)
		.map((token) => token.trim())
		.filter(Boolean);

	if (tokens.length === 0 || tokens.length > 3) {
		return null;
	}
	if (
		!tokens.every((token) => STANDALONE_ROLE_LINE_ALLOWED_TOKENS.has(token))
	) {
		return null;
	}

	const filtered = tokens.filter((token) => token !== "said");
	const hasUserToken = filtered.some((token) => USER_LABELS.has(token));
	const hasAssistantToken = filtered.some((token) =>
		ASSISTANT_LABELS.has(token),
	);

	if (hasUserToken && !hasAssistantToken) return "user";
	if (hasAssistantToken && !hasUserToken) return "assistant";
	return null;
}

function parseStandaloneRoleTranscript(markdown: string): {
	messages: ParsedMessage[];
} {
	const lines = markdown.split(/\r?\n/);
	const messages: ParsedMessage[] = [];
	let currentRole: "user" | "assistant" | null = null;
	let currentParts: string[] = [];
	let inCodeBlock = false;

	const flush = () => {
		if (!currentRole) return;
		const content = currentParts.join("\n").trim();
		if (!content) return;
		messages.push({ role: currentRole, content });
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!inCodeBlock) {
			const role = resolveStandaloneRoleLine(line);
			if (role) {
				const carried = detachTrailingAttachmentLines(currentParts);
				flush();
				currentRole = role;
				currentParts = carried;
				continue;
			}
		}

		if (currentRole) {
			currentParts.push(line);
		}
		if (/^```/.test(trimmed)) {
			inCodeBlock = !inCodeBlock;
		}
	}

	flush();

	if (messages.length < 2) {
		return { messages: [] };
	}

	const hasUser = messages.some((message) => message.role === "user");
	const hasAssistant = messages.some((message) => message.role === "assistant");
	if (!hasUser || !hasAssistant) {
		return { messages: [] };
	}

	return { messages };
}

function canonicalizeSpeakerLabel(label: string): string {
	return label
		.toLowerCase()
		.replace(/\*\*/g, "")
		.replace(/[()]/g, " ")
		.replace(/[^\w\s-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenizeSpeakerLabel(label: string): string[] {
	return label
		.split(/[ _-]+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function isLikelyColonSpeakerLabel(rawLabel: string | undefined): boolean {
	if (!rawLabel) return false;
	const normalized = canonicalizeSpeakerLabel(rawLabel);
	if (!normalized || normalized.length > 40) {
		return false;
	}

	const tokens = tokenizeSpeakerLabel(normalized);
	if (tokens.length === 0 || tokens.length > 4) {
		return false;
	}

	const hasKnownRoleToken = tokens.some(
		(token) => USER_LABELS.has(token) || ASSISTANT_LABELS.has(token),
	);
	if (
		!hasKnownRoleToken &&
		tokens.every((token) => NON_SPEAKER_LABEL_TOKENS.has(token))
	) {
		return false;
	}
	const hasModelLikeToken =
		/\b(gpt|claude|gemini|perplexity|assistant|bot|ai|model|speaker)\b/i.test(
			normalized,
		);
	const hasNumericToken = tokens.some((token) => /\d/.test(token));

	if (!hasKnownRoleToken && !hasModelLikeToken && !hasNumericToken) {
		return false;
	}

	return true;
}

function extractStandaloneSpeakerLabel(rawLine: string): string | null {
	const normalizedLine = normalizeStandaloneRoleLine(rawLine);
	if (!normalizedLine || normalizedLine.length > 32) {
		return null;
	}
	if (/[.?!:]/.test(normalizedLine)) {
		return null;
	}

	const normalized = canonicalizeSpeakerLabel(normalizedLine);
	const tokens = tokenizeSpeakerLabel(normalized);
	if (tokens.length === 0 || tokens.length > 3) {
		return null;
	}
	const hasKnownRoleToken = tokens.some(
		(token) => USER_LABELS.has(token) || ASSISTANT_LABELS.has(token),
	);
	if (
		!hasKnownRoleToken &&
		tokens.every((token) => NON_SPEAKER_LABEL_TOKENS.has(token))
	) {
		return null;
	}
	const hasModelLikeToken =
		/\b(gpt|claude|gemini|perplexity|assistant|bot|ai|model|speaker)\b/i.test(
			normalized,
		);
	const hasNumericToken = tokens.some((token) => /\d/.test(token));
	if (!hasKnownRoleToken && !hasModelLikeToken && !hasNumericToken) {
		return null;
	}

	return normalizedLine;
}

type SpeakerSegment = {
	labelKey: string;
	labelRaw: string;
	content: string;
};

function mapSpeakerLabelsToRoles(
	segments: SpeakerSegment[],
): Map<string, "user" | "assistant"> | null {
	if (segments.length < 2) {
		return null;
	}

	const labelKeys = Array.from(
		new Set(segments.map((segment) => segment.labelKey)),
	);
	if (labelKeys.length < 2) {
		return null;
	}

	let bestPair: [string, string] | null = null;
	let bestScore = -1;
	let bestPairSegments: SpeakerSegment[] = [];

	for (let i = 0; i < labelKeys.length; i += 1) {
		for (let j = i + 1; j < labelKeys.length; j += 1) {
			const first = labelKeys[i];
			const second = labelKeys[j];
			if (!first || !second) continue;
			const pairSegments = segments.filter(
				(segment) => segment.labelKey === first || segment.labelKey === second,
			);
			if (pairSegments.length < 2) {
				continue;
			}

			const firstCount = pairSegments.filter(
				(segment) => segment.labelKey === first,
			).length;
			const secondCount = pairSegments.filter(
				(segment) => segment.labelKey === second,
			).length;
			if (firstCount === 0 || secondCount === 0) {
				continue;
			}

			const switches = pairSegments.reduce((count, segment, index) => {
				if (index === 0) return 0;
				const prev = pairSegments[index - 1];
				if (!prev) return count;
				return count + (segment.labelKey !== prev.labelKey ? 1 : 0);
			}, 0);

			const switchRatio = switches / Math.max(1, pairSegments.length - 1);
			if (pairSegments.length >= 4 && switchRatio < 0.25) {
				continue;
			}

			const coverage = pairSegments.length / segments.length;
			const balance =
				Math.min(firstCount, secondCount) / Math.max(firstCount, secondCount);
			const hints =
				(normalizeRoleLabel(first) ? 0.1 : 0) +
				(normalizeRoleLabel(second) ? 0.1 : 0);
			const score =
				switchRatio * 0.55 + coverage * 0.3 + balance * 0.15 + hints;

			if (score > bestScore) {
				bestScore = score;
				bestPair = [first, second];
				bestPairSegments = pairSegments;
			}
		}
	}

	if (!bestPair || bestScore < 0.35) {
		return null;
	}

	const [rawFirstLabel, rawSecondLabel] = bestPair;
	const firstIndex = segments.findIndex(
		(segment) => segment.labelKey === rawFirstLabel,
	);
	const secondIndex = segments.findIndex(
		(segment) => segment.labelKey === rawSecondLabel,
	);
	const [firstLabel, secondLabel] =
		firstIndex <= secondIndex
			? [rawFirstLabel, rawSecondLabel]
			: [rawSecondLabel, rawFirstLabel];

	const firstHint = normalizeRoleLabel(firstLabel);
	const secondHint = normalizeRoleLabel(secondLabel);

	let userLabel: string | null = null;
	let assistantLabel: string | null = null;

	if (firstHint === "user") userLabel = firstLabel;
	if (firstHint === "assistant") assistantLabel = firstLabel;
	if (secondHint === "user") userLabel = secondLabel;
	if (secondHint === "assistant") assistantLabel = secondLabel;

	if (userLabel && !assistantLabel) {
		assistantLabel = userLabel === firstLabel ? secondLabel : firstLabel;
	}
	if (assistantLabel && !userLabel) {
		userLabel = assistantLabel === firstLabel ? secondLabel : firstLabel;
	}

	if (!userLabel || !assistantLabel) {
		const firstLengths = bestPairSegments
			.filter((segment) => segment.labelKey === firstLabel)
			.map((segment) => segment.content.length);
		const secondLengths = bestPairSegments
			.filter((segment) => segment.labelKey === secondLabel)
			.map((segment) => segment.content.length);

		const firstAverageLength =
			firstLengths.reduce((sum, value) => sum + value, 0) /
			Math.max(1, firstLengths.length);
		const secondAverageLength =
			secondLengths.reduce((sum, value) => sum + value, 0) /
			Math.max(1, secondLengths.length);
		const relativeLengthGap =
			Math.max(firstAverageLength, secondAverageLength) /
			Math.max(1, Math.min(firstAverageLength, secondAverageLength));

		if (relativeLengthGap >= 1.25) {
			assistantLabel =
				firstAverageLength >= secondAverageLength ? firstLabel : secondLabel;
			userLabel = assistantLabel === firstLabel ? secondLabel : firstLabel;
		} else {
			userLabel = firstLabel;
			assistantLabel = secondLabel;
		}
	}

	if (userLabel === assistantLabel) {
		return null;
	}

	const mapping = new Map<string, "user" | "assistant">();
	mapping.set(userLabel, "user");
	mapping.set(assistantLabel, "assistant");
	return mapping;
}

function parseGenericSpeakerTranscript(markdown: string): {
	messages: ParsedMessage[];
} {
	const lines = markdown.split(/\r?\n/);
	const segments: SpeakerSegment[] = [];

	let currentLabelRaw: string | null = null;
	let currentLabelKey: string | null = null;
	let currentParts: string[] = [];
	let inCodeBlock = false;

	const flush = () => {
		if (!currentLabelKey || !currentLabelRaw) return;
		const content = currentParts.join("\n").trim();
		if (!content) return;
		segments.push({
			labelKey: currentLabelKey,
			labelRaw: currentLabelRaw,
			content,
		});
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!inCodeBlock) {
			const roleMatch = line.match(ROLE_HEADER_REGEX);
			if (roleMatch && isLikelyColonSpeakerLabel(roleMatch[1])) {
				const carried = detachTrailingAttachmentLines(currentParts);
				flush();
				currentLabelRaw = (roleMatch[1] ?? "").trim();
				currentLabelKey = canonicalizeSpeakerLabel(currentLabelRaw);
				currentParts = carried;
				const inlineContent = roleMatch[2]?.trim();
				if (inlineContent) {
					currentParts.push(inlineContent);
				}
				continue;
			}

			const standaloneLabel = extractStandaloneSpeakerLabel(line);
			if (standaloneLabel) {
				const carried = detachTrailingAttachmentLines(currentParts);
				flush();
				currentLabelRaw = standaloneLabel;
				currentLabelKey = canonicalizeSpeakerLabel(standaloneLabel);
				currentParts = carried;
				continue;
			}
		}

		if (currentLabelKey) {
			currentParts.push(line);
		}
		if (/^```/.test(trimmed)) {
			inCodeBlock = !inCodeBlock;
		}
	}

	flush();

	if (segments.length < 2) {
		return { messages: [] };
	}

	const mapping = mapSpeakerLabelsToRoles(segments);
	if (!mapping) {
		return { messages: [] };
	}

	const mappedMessages = segments
		.map((segment) => ({
			role: mapping.get(segment.labelKey),
			content: segment.content.trim(),
		}))
		.filter(
			(segment): segment is ParsedMessage =>
				Boolean(segment.role) && Boolean(segment.content),
		);

	const messages = mergeAdjacentSameRoleMessages(mappedMessages);
	if (messages.length < 2) {
		return { messages: [] };
	}

	const hasUser = messages.some((message) => message.role === "user");
	const hasAssistant = messages.some((message) => message.role === "assistant");
	if (!hasUser || !hasAssistant) {
		return { messages: [] };
	}

	return { messages };
}

// ============================================================================
// PARSER
// ============================================================================

export function parseNormalizedTranscript(normalizedText: string): {
	messages: ParsedMessage[];
} {
	const lines = normalizedText.split(/\r?\n/);
	const messages: ParsedMessage[] = [];
	let currentRole: "user" | "assistant" | null = null;
	let currentParts: string[] = [];
	let inCodeBlock = false;

	const flush = () => {
		if (!currentRole) return;
		const content = currentParts.join("\n").trim();
		if (!content) return;
		messages.push({ role: currentRole, content });
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!inCodeBlock) {
			const markerMatch = trimmed.match(/^\[(user|assistant)\]:\s*(.*)$/i);
			if (markerMatch) {
				const carried = detachTrailingAttachmentLines(currentParts);
				flush();
				currentRole =
					(markerMatch[1] ?? "").toLowerCase() === "user"
						? "user"
						: "assistant";
				currentParts = carried;
				const inlineContent = markerMatch[2]?.trim();
				if (inlineContent) {
					currentParts.push(inlineContent);
				}
				continue;
			}
		}

		if (currentRole) {
			currentParts.push(line);
		}
		if (/^```/.test(trimmed)) {
			inCodeBlock = !inCodeBlock;
		}
	}

	flush();

	return {
		messages: mergeAdjacentSameRoleMessages(messages),
	};
}

async function scrapeAndExtract(
	url: string,
	apiKey: string,
	reportProgress?: ImportProgressReporter,
): Promise<FirecrawlExtractionResult> {
	const startedAtMs = Date.now();
	const requestBody = buildFirecrawlScrapeRequest(url);
	const requiresArtifactAwareNormalization = isClaudeSharedUrl(url);

	const scrapeStartedAtMs = Date.now();
	if (reportProgress) {
		await reportProgress(12, "Fetching shared page");
	}
	const response = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		let errorMessage = `Firecrawl API error: ${response.status}`;
		try {
			const errorJson = JSON.parse(errorBody);
			if (errorJson.error) {
				errorMessage = errorJson.error;
			}
		} catch {
			// ignore
		}
		throw new Error(errorMessage);
	}

	const scrapeCompletedAtMs = Date.now();
	const result = (await response.json()) as FirecrawlScrapeApiResponse;
	if (!result.success) {
		throw new Error(result.error || "Firecrawl scrape failed");
	}

	const markdown = result.data?.markdown || "";
	if (!markdown) {
		throw new Error("No content found on the page");
	}

	if (reportProgress) {
		await reportProgress(32, "Parsing transcript");
	}

	let { messages } = requiresArtifactAwareNormalization
		? { messages: [] as ParsedMessage[] }
		: parseRoleLabeledTranscript(markdown);
	let extractionStrategy: "regex" | "normalized_markers" | "llm" = "regex";
	let normalizationDurationMs: number | undefined;
	if (messages.length > 0 && reportProgress) {
		await reportProgress(68, "Detected role labels");
	}

	if (
		!requiresArtifactAwareNormalization &&
		messages.length === 0 &&
		/\[(?:USER|ASSISTANT)\]:/i.test(markdown)
	) {
		messages = parseNormalizedTranscript(markdown).messages;
		extractionStrategy = "normalized_markers";
		if (messages.length > 0 && reportProgress) {
			await reportProgress(74, "Found transcript markers");
		}
	}

	if (!requiresArtifactAwareNormalization && messages.length === 0) {
		messages = parseStandaloneRoleTranscript(markdown).messages;
		if (messages.length > 0) {
			extractionStrategy = "regex";
			if (reportProgress) {
				await reportProgress(70, "Detected speaker headings");
			}
		}
	}

	if (!requiresArtifactAwareNormalization && messages.length === 0) {
		const genericMessages = parseGenericSpeakerTranscript(markdown).messages;
		if (genericMessages.length > 0) {
			messages = genericMessages;
			extractionStrategy = "regex";
			if (reportProgress) {
				await reportProgress(76, "Mapped speaker labels");
			}
		}
	}

	if (messages.length === 0) {
		const normalizationStartedAtMs = Date.now();
		if (reportProgress) {
			await reportProgress(
				46,
				requiresArtifactAwareNormalization
					? "Preserving Claude messages and artifacts"
					: "Resolving speakers with AI",
			);
		}
		messages = await normalizeTranscriptWithLLM(
			markdown,
			async (done, total) => {
				if (!reportProgress || total <= 0) return;
				const progress = 46 + Math.round((done / total) * 36);
				await reportProgress(
					progress,
					requiresArtifactAwareNormalization
						? "Preserving Claude messages and artifacts"
						: "Resolving speakers with AI",
				);
			},
		);
		normalizationDurationMs = Date.now() - normalizationStartedAtMs;
		extractionStrategy = "llm";
	}

	if (messages.length === 0) {
		throw new Error(
			"Could not extract any messages from the page. The parsing might have failed.",
		);
	}

	messages = repairLikelyRoleDrift(
		splitEmbeddedUserTurns(mergeAdjacentSameRoleMessages(messages)),
	);

	if (messages.length === 0) {
		throw new Error("Could not resolve speaker roles in this transcript.");
	}

	const rawTitle = result.data?.metadata?.title;
	let finalTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
	const firstMessage = messages[0];
	if (!finalTitle && firstMessage && firstMessage.role === "user") {
		const firstLine = firstMessage.content.split("\n")[0]?.trim() ?? "";
		finalTitle =
			firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine;
	}
	if (!finalTitle) {
		finalTitle = "Imported Chat";
	}

	if (reportProgress) {
		await reportProgress(88, `Extracted ${messages.length} messages`);
	}

	return {
		title: finalTitle,
		messages,
		metadata: result.data?.metadata || null,
		timingsMs: {
			total: Date.now() - startedAtMs,
			firecrawl: scrapeCompletedAtMs - scrapeStartedAtMs,
			normalization: normalizationDurationMs,
		},
		extractionStrategy,
	};
}

// ============================================================================
// MAIN ACTION: SCRAPE URL
// ============================================================================

export const scrapeUrl = action({
	args: {
		url: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const apiKey = process.env.FIRECRAWL_API_KEY;
		if (!apiKey) {
			throw new Error(
				"FIRECRAWL_API_KEY is not set in Convex environment variables",
			);
		}
		return scrapeAndExtract(args.url, apiKey);
	},
});

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const MAX_REHOSTED_IMAGES = 25;
const MAX_REHOSTED_IMAGE_BYTES = 10 * 1024 * 1024;
const REHOST_FETCH_TIMEOUT_MS = 15_000;

// Providers serve chat attachments from signed, short-lived URLs (ChatGPT's
// files.oaiusercontent.com links carry an expiry) or behind hotlink protection.
// Hotlinking them means the image works for a few hours and then 403s, leaving
// the reader with nothing but the alt text. Copy the bytes into our own storage
// while the scrape's URLs are still live.
async function rehostImportedImages(
	ctx: { storage: { store: (blob: Blob) => Promise<string>; getUrl: (id: string) => Promise<string | null> } },
	messages: ParsedMessage[],
): Promise<{ messages: ParsedMessage[]; found: number; rehosted: number }> {
	const sources = new Set<string>();
	for (const message of messages) {
		for (const match of message.content.matchAll(MARKDOWN_IMAGE_REGEX)) {
			const url = match[2];
			if (url) sources.add(url);
		}
	}

	if (sources.size === 0) {
		return { messages, found: 0, rehosted: 0 };
	}

	const rewrites = new Map<string, string>();
	for (const source of Array.from(sources).slice(0, MAX_REHOSTED_IMAGES)) {
		try {
			const response = await fetch(source, {
				signal: AbortSignal.timeout(REHOST_FETCH_TIMEOUT_MS),
			});
			if (!response.ok) continue;

			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.startsWith("image/")) continue;

			const blob = await response.blob();
			if (blob.size === 0 || blob.size > MAX_REHOSTED_IMAGE_BYTES) continue;

			const storageId = await ctx.storage.store(blob);
			const storedUrl = await ctx.storage.getUrl(storageId);
			if (storedUrl) rewrites.set(source, storedUrl);
		} catch {
			// Leave the original URL in place; a broken image is still better than
			// dropping the reader's attachment entirely.
		}
	}

	if (rewrites.size === 0) {
		return { messages, found: sources.size, rehosted: 0 };
	}

	const rewritten = messages.map((message) => ({
		role: message.role,
		content: message.content.replace(
			MARKDOWN_IMAGE_REGEX,
			(original, alt: string, url: string) => {
				const replacement = rewrites.get(url);
				return replacement ? `![${alt}](${replacement})` : original;
			},
		),
	}));

	return { messages: rewritten, found: sources.size, rehosted: rewrites.size };
}

export const importIntoChat = action({
	args: {
		chatId: v.id("chats"),
		url: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const apiKey = process.env.FIRECRAWL_API_KEY;
		if (!apiKey) {
			throw new Error(
				"FIRECRAWL_API_KEY is not set in Convex environment variables",
			);
		}

		let lastProgress = 0;
		let lastStage = "";
		const reportProgress: ImportProgressReporter = async (percent, stage) => {
			const safePercent = Math.max(1, Math.min(99, Math.round(percent)));
			const normalizedStage = stage.replace(/\s+/g, " ").trim().slice(0, 72);
			if (!normalizedStage) return;
			if (safePercent < lastProgress) return;
			if (safePercent === lastProgress && normalizedStage === lastStage) return;

			lastProgress = safePercent;
			lastStage = normalizedStage;

			await ctx.runMutation(api.chats.updateChatTitle, {
				chatId: args.chatId,
				title: `Importing ${safePercent}% · ${normalizedStage}`,
			});
		};

		try {
			await reportProgress(5, "Queued");
			let result: FirecrawlExtractionResult | null = null;
			let lastError: Error | null = null;

			for (let attempt = 1; attempt <= SCRAPE_MAX_RETRIES; attempt++) {
				try {
					if (attempt > 1) {
						lastProgress = 0;
						lastStage = "";
						await reportProgress(5, `Retry ${attempt}/${SCRAPE_MAX_RETRIES}`);
						await new Promise((r) =>
							setTimeout(r, SCRAPE_RETRY_DELAY_MS * attempt),
						);
					}
					result = await scrapeAndExtract(args.url, apiKey, reportProgress);
					break;
				} catch (err) {
					lastError = err instanceof Error ? err : new Error(String(err));
					const isTimeout =
						lastError.message.toLowerCase().includes("timed out") ||
						lastError.message.toLowerCase().includes("timeout");
					if (!isTimeout || attempt === SCRAPE_MAX_RETRIES) {
						throw lastError;
					}
				}
			}

			if (!result) {
				throw lastError ?? new Error("Scrape failed after retries");
			}
			const extracted = (result.messages ?? []).map((message) => ({
				role: message.role,
				content: message.content,
			}));

			if (extracted.length === 0) {
				throw new Error("No messages were extracted from this link.");
			}

			await reportProgress(90, "Saving attachments");
			const {
				messages,
				found: imagesFound,
				rehosted: imagesRehosted,
			} = await rehostImportedImages(ctx, extracted);
			// Whether a share page yields a real image URL or only its alt-text
			// placeholder is provider- and DOM-dependent; log both counts so a failed
			// attachment can be told apart from one that was never scraped at all.
			console.log(
				`[import] ${args.url} images_in_markdown=${imagesFound} rehosted=${imagesRehosted}`,
			);

			await reportProgress(95, "Saving messages");
			await ctx.runMutation(api.chats.appendImportedMessagesToChat, {
				chatId: args.chatId,
				title: result.title || "Imported Chat",
				messages,
			});

			return {
				success: true,
				messageCount: messages.length,
				extractionStrategy: result.extractionStrategy,
				timingsMs: result.timingsMs ?? null,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to import conversation";

			await ctx.runMutation(api.chats.appendImportFailureMessageToChat, {
				chatId: args.chatId,
				errorMessage,
			});

			return {
				success: false,
				error: errorMessage,
			};
		}
	},
});
