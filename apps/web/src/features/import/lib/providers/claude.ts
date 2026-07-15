import * as cheerio from "cheerio";
import type { NormalizedMessage, NormalizedTranscript } from "../../types";
import type { ProviderParser } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function artifactFenceLanguage(mediaType: string): string {
	const normalized = mediaType.toLowerCase();
	if (normalized.includes("html") || /\.html?$/.test(normalized)) return "html";
	if (
		normalized.includes("react") ||
		normalized.includes("jsx") ||
		/\.[jt]sx$/.test(normalized)
	)
		return "jsx";
	if (normalized.includes("svg") || /\.svg$/.test(normalized)) return "svg";
	if (normalized.includes("mermaid")) return "mermaid";
	if (normalized.includes("markdown") || /\.md$/.test(normalized))
		return "markdown";
	if (normalized.includes("json") || /\.json$/.test(normalized)) return "json";
	if (normalized.includes("javascript") || /\.m?js$/.test(normalized))
		return "javascript";
	if (normalized.includes("typescript") || /\.ts$/.test(normalized))
		return "typescript";
	return "text";
}

function formatArtifact(record: JsonRecord): string | null {
	const input = asRecord(record.input);
	const source = input ?? record;
	const recordType = typeof record.type === "string" ? record.type : "";
	const recordName = typeof record.name === "string" ? record.name : "";
	const sourceType = typeof source.type === "string" ? source.type : "";
	const sourceMediaType =
		typeof source.mime_type === "string"
			? source.mime_type
			: typeof source.media_type === "string"
				? source.media_type
				: sourceType;
	const isArtifact =
		/artifact/i.test(recordType) ||
		/artifact/i.test(recordName) ||
		recordName === "create_file" ||
		(Boolean(input) &&
			/(?:text\/(?:html|markdown)|image\/svg|react|jsx|mermaid)/i.test(
				sourceMediaType,
			));
	if (!isArtifact || typeof source.content !== "string") return null;

	const content = source.content.trim();
	if (!content) return null;
	const title =
		typeof source.title === "string" && source.title.trim()
			? source.title.trim()
			: typeof source.filename === "string" && source.filename.trim()
				? source.filename.trim()
				: "Untitled";
	const language = artifactFenceLanguage(
		sourceMediaType ||
			(typeof source.filename === "string" ? source.filename : "") ||
			recordType,
	);
	return `### Claude Artifact: ${title}\n\n\`\`\`${language}\n${content}\n\`\`\``;
}

export function normalizeClaudeMessageContent(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (Array.isArray(value)) {
		return value
			.flatMap((item) => {
				const content = normalizeClaudeMessageContent(item);
				return content ? [content] : [];
			})
			.join("\n\n")
			.trim();
	}

	const record = asRecord(value);
	if (!record) return "";
	const artifact = formatArtifact(record);
	if (artifact) return artifact;

	const parts: string[] = [];
	if (typeof record.text === "string" && record.text.trim()) {
		parts.push(record.text.trim());
	}
	if (record.content !== undefined) {
		const content = normalizeClaudeMessageContent(record.content);
		if (content) parts.push(content);
	}
	return Array.from(new Set(parts)).join("\n\n").trim();
}

export const claudeParser: ProviderParser = {
	name: "claude",

	detect: (url: string): boolean => {
		try {
			const parsed = new URL(url);
			return parsed.hostname.includes("claude.ai");
		} catch {
			return false;
		}
	},

	fetch: async (url: string): Promise<string> => {
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
			},
			signal: AbortSignal.timeout(15000),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch: ${response.status}`);
		}

		return response.text();
	},

	parse: async (html: string, url: string): Promise<NormalizedTranscript> => {
		const $ = cheerio.load(html);
		const messages: NormalizedMessage[] = [];

		// Try to find embedded JSON/data
		const scripts = $("script").toArray();
		for (const script of scripts) {
			const content = $(script).html();
			if (content?.includes("messages") || content?.includes("conversation")) {
				try {
					const jsonMatch = content.match(/\{[\s\S]*"messages"[\s\S]*\}/);
					if (jsonMatch) {
						const data = JSON.parse(jsonMatch[0]);
						if (data.messages && Array.isArray(data.messages)) {
							type ClaudeMessageData = {
								role?: string;
								content?: unknown;
							};
							data.messages.forEach((msg: ClaudeMessageData, i: number) => {
								const content = normalizeClaudeMessageContent(msg.content);
								if (msg.role && content) {
									messages.push({
										role:
											msg.role === "human" || msg.role === "user"
												? "user"
												: "assistant",
										content,
										order: i,
									});
								}
							});
						}
					}
				} catch {
					// Continue to DOM parsing
				}
			}
		}

		// Fallback: DOM parsing
		if (messages.length === 0) {
			// Claude's shared conversation structure
			const messageEls = $(
				'[data-testid*="message"], [class*="ConversationMessage"], [class*="human-turn"], [class*="assistant-turn"]',
			).toArray();

			messageEls.forEach((el, i) => {
				const $el = $(el);
				const testId = $el.attr("data-testid") || "";
				const className = $el.attr("class") || "";

				const isUser =
					testId.includes("human") ||
					testId.includes("user") ||
					className.includes("human") ||
					className.includes("user");

				const content =
					$el.find('[class*="prose"], [class*="markdown"]').text().trim() ||
					$el.text().trim();

				if (content && content.length > 0) {
					messages.push({
						role: isUser ? "user" : "assistant",
						content,
						order: i,
					});
				}
			});
		}

		// Extract title
		let title = $("title").text().trim();
		if (title.includes("Claude")) {
			title = title.replace(/[-–]?\s*Claude\s*[-–]?/g, "").trim();
		}
		if (!title) {
			const firstMessage = messages[0];
			title = firstMessage
				? `${firstMessage.content.slice(0, 50)}...`
				: "Imported Claude Chat";
		}

		return {
			provider: "claude",
			title,
			messages,
			sourceUrl: url,
			fetchedAt: Date.now(),
		};
	},
};
