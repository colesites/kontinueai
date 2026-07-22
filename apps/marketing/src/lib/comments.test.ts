import { describe, expect, test } from "bun:test";
import { COMMENT_LIMITS, parseCommentSubmission } from "./comments";

describe("comment submissions", () => {
	test("normalizes a valid guest comment", () => {
		const result = parseCommentSubmission({
			postId: "post-123",
			authorName: "  Ada   Lovelace ",
			text: "A thoughtful point.\r\n\r\nThanks for sharing!",
			website: "",
		});

		expect(result).toEqual({
			success: true,
			data: {
				postId: "post-123",
				authorName: "Ada Lovelace",
				text: "A thoughtful point.\n\nThanks for sharing!",
				website: "",
			},
		});
	});

	test("rejects invalid names, oversized comments, and link spam", () => {
		expect(
			parseCommentSubmission({
				postId: "post-123",
				authorName: "A",
				text: "Good post",
			}),
		).toMatchObject({ success: false });

		expect(
			parseCommentSubmission({
				postId: "post-123",
				authorName: "Ada",
				text: "x".repeat(COMMENT_LIMITS.textMax + 1),
			}),
		).toMatchObject({ success: false });

		expect(
			parseCommentSubmission({
				postId: "post-123",
				authorName: "Ada",
				text: "https://one.test https://two.test https://three.test",
			}),
		).toMatchObject({
			success: false,
			error: "Comments may contain at most 2 links.",
		});
	});
});
