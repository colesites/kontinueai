import { createHmac } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { parseCommentSubmission } from "@/lib/comments";
import { COMMENT_SUBMISSION_CONTEXT_QUERY } from "@/sanity/lib/queries";
import { writeClient } from "@/sanity/lib/writeClient";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_COMMENTS_PER_WINDOW = 3;
const MAX_REQUEST_BYTES = 8_000;

type SubmissionContext = {
	post: { _id: string; slug: string | null } | null;
	recentCount: number;
	isDuplicate: boolean;
};

function requestAddress(request: NextRequest): string {
	const forwarded =
		request.headers.get("x-vercel-forwarded-for") ??
		request.headers.get("x-forwarded-for") ??
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-real-ip") ??
		"unknown";
	return forwarded.split(",")[0]?.trim() || "unknown";
}

function digest(value: string, secret: string): string {
	return createHmac("sha256", secret).update(value).digest("hex");
}

function isSameOrigin(request: NextRequest): boolean {
	const origin = request.headers.get("origin");
	if (!origin) return false;
	try {
		return new URL(origin).host === request.headers.get("host");
	} catch {
		return false;
	}
}

export async function POST(request: NextRequest) {
	if (!isSameOrigin(request)) {
		return NextResponse.json(
			{ error: "Invalid request origin." },
			{ status: 403 },
		);
	}

	const contentLength = Number(request.headers.get("content-length") ?? "0");
	if (contentLength > MAX_REQUEST_BYTES) {
		return NextResponse.json(
			{ error: "Comment submission is too large." },
			{ status: 413 },
		);
	}

	if (!process.env.SANITY_API_WRITE_TOKEN) {
		return NextResponse.json(
			{ error: "Comments are temporarily unavailable." },
			{ status: 503 },
		);
	}

	const parsed = parseCommentSubmission(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}

	// Silently accept honeypot submissions so bots do not learn how to bypass it.
	if (parsed.data.website) {
		return NextResponse.json({ ok: true, moderation: "pending" });
	}

	const secret =
		process.env.COMMENT_FINGERPRINT_SECRET ??
		process.env.SANITY_API_WRITE_TOKEN;
	const userAgent = request.headers.get("user-agent") ?? "unknown";
	const submitterHash = digest(
		`${requestAddress(request)}|${userAgent}`,
		secret,
	);
	const contentHash = digest(
		`${parsed.data.postId}|${parsed.data.authorName.toLowerCase()}|${parsed.data.text.toLowerCase()}`,
		secret,
	);
	const now = Date.now();

	try {
		const context = await writeClient.fetch<SubmissionContext>(
			COMMENT_SUBMISSION_CONTEXT_QUERY,
			{
				postId: parsed.data.postId,
				submitterHash,
				contentHash,
				rateCutoff: new Date(now - RATE_LIMIT_WINDOW_MS).toISOString(),
				duplicateCutoff: new Date(now - DUPLICATE_WINDOW_MS).toISOString(),
			},
		);

		if (!context.post) {
			return NextResponse.json(
				{ error: "Article not found." },
				{ status: 404 },
			);
		}
		if (context.isDuplicate) {
			return NextResponse.json(
				{ error: "You already submitted this comment." },
				{ status: 409 },
			);
		}
		if (context.recentCount >= MAX_COMMENTS_PER_WINDOW) {
			return NextResponse.json(
				{
					error: "Too many comments. Please wait a few minutes and try again.",
				},
				{ status: 429, headers: { "Retry-After": "600" } },
			);
		}

		await writeClient.create({
			_type: "comment",
			post: { _type: "reference", _ref: context.post._id },
			authorName: parsed.data.authorName,
			text: parsed.data.text,
			createdAt: new Date(now).toISOString(),
			status: "pending",
			submitterHash,
			contentHash,
		});

		return NextResponse.json(
			{ ok: true, moderation: "pending" },
			{ status: 201 },
		);
	} catch (error) {
		Sentry.captureException(error);
		return NextResponse.json(
			{ error: "We couldn't submit your comment. Please try again." },
			{ status: 500 },
		);
	}
}
