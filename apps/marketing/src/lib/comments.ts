export const COMMENT_LIMITS = {
	authorNameMin: 2,
	authorNameMax: 60,
	textMin: 3,
	textMax: 2_000,
	maxLinks: 2,
} as const;

export type CommentSubmission = {
	postId: string;
	authorName: string;
	text: string;
	website: string;
};

type ParseResult =
	| { success: true; data: CommentSubmission }
	| { success: false; error: string };

function cleanSingleLine(value: string): string {
	return Array.from(value, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint < 32 || codePoint === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

function cleanCommentText(value: string): string {
	const normalizedNewlines = value.replace(/\r\n?/g, "\n");
	return Array.from(normalizedNewlines, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		if (character === "\n" || character === "\t") return character;
		return codePoint < 32 || codePoint === 127 ? "" : character;
	})
		.join("")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function parseCommentSubmission(input: unknown): ParseResult {
	if (!input || typeof input !== "object") {
		return { success: false, error: "Invalid comment submission." };
	}

	const body = input as Record<string, unknown>;
	const postId = typeof body.postId === "string" ? body.postId.trim() : "";
	const authorName =
		typeof body.authorName === "string" ? cleanSingleLine(body.authorName) : "";
	const text = typeof body.text === "string" ? cleanCommentText(body.text) : "";
	const website = typeof body.website === "string" ? body.website.trim() : "";

	if (!postId || postId.length > 200) {
		return { success: false, error: "This article could not be identified." };
	}
	if (
		authorName.length < COMMENT_LIMITS.authorNameMin ||
		authorName.length > COMMENT_LIMITS.authorNameMax
	) {
		return {
			success: false,
			error: `Display name must be ${COMMENT_LIMITS.authorNameMin}–${COMMENT_LIMITS.authorNameMax} characters.`,
		};
	}
	if (
		text.length < COMMENT_LIMITS.textMin ||
		text.length > COMMENT_LIMITS.textMax
	) {
		return {
			success: false,
			error: `Comment must be ${COMMENT_LIMITS.textMin}–${COMMENT_LIMITS.textMax.toLocaleString()} characters.`,
		};
	}

	const linkCount = text.match(/(?:https?:\/\/|www\.)/gi)?.length ?? 0;
	if (linkCount > COMMENT_LIMITS.maxLinks) {
		return {
			success: false,
			error: `Comments may contain at most ${COMMENT_LIMITS.maxLinks} links.`,
		};
	}

	return {
		success: true,
		data: { postId, authorName, text, website },
	};
}
