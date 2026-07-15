import { auth } from "@clerk/nextjs/server";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import { PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { put } from "@vercel/blob";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { getUserPlanTier } from "../../chat/lib/plan-limits";
import { PLAN_ERROR_CODES } from "../../lib/plan-denial";

// Allowed MIME types
const ALLOWED_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/svg+xml",
	"application/pdf",
	"application/json",
	"application/xml",
	"text/xml",
	"application/x-yaml",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"video/mp4",
	"video/webm",
	"video/quicktime",
	"audio/mpeg",
	"audio/mp4",
	"audio/aac",
	"audio/wav",
	"audio/ogg",
	"audio/webm",
	"audio/flac",
];

export async function POST(request: Request) {
	try {
		// Check authentication
		const authResult = await auth();
		const userId = authResult.userId;

		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized - please sign in" },
				{ status: 401 },
			);
		}

		const planTier = await getUserPlanTier(
			userId,
			typeof authResult.has === "function" ? authResult.has : undefined,
		);

		// Get filename from query params
		const { searchParams } = new URL(request.url);
		const filename = searchParams.get("filename");

		if (!filename) {
			return NextResponse.json(
				{ error: "Filename is required" },
				{ status: 400 },
			);
		}

		// Get the file from the request body
		const blob = await request.blob();
		const contentType = blob.type;

		if (!canAccessPlanFeature(planTier, "file-upload")) {
			return NextResponse.json(
				{
					code: "FREE_PLAN_UPLOAD_DISABLED",
					error:
						"Chat file uploads are available on Starter, Plus, Pro, and Max.",
				},
				{
					status: 403,
					headers: {
						"x-error-code": PLAN_ERROR_CODES.FILE_UPLOAD_REQUIRED,
					},
				},
			);
		}

		// Validate file size
		const maxFileSize = PLAN_DEFINITIONS[planTier].maxChatUploadBytes;
		if (blob.size > maxFileSize) {
			return NextResponse.json(
				{
					error: `File size exceeds the ${Math.round(maxFileSize / (1024 * 1024))}MB limit for ${PLAN_DEFINITIONS[planTier].name}`,
				},
				{ status: 400 },
			);
		}

		// Validate content type
		const isText = contentType.startsWith("text/");
		if (!isText && !ALLOWED_TYPES.includes(contentType)) {
			return NextResponse.json(
				{
					error:
						"Invalid file type. Allowed: images, PDF, MP4, WebM, MOV, MP3, M4A, AAC, WAV, OGG, FLAC, and text files",
					allowedTypes: ALLOWED_TYPES,
				},
				{ status: 400 },
			);
		}

		const convexToken =
			(await authResult.getToken?.({ template: "convex" })) ?? null;
		if (!convexToken) {
			return NextResponse.json(
				{ error: "Your account could not be verified. Please try again." },
				{ status: 503 },
			);
		}
		const allowance = await fetchQuery(
			convexApi.files.getUploadAllowance,
			{ size: blob.size },
			{ token: convexToken },
		);
		if (!allowance.allowed) {
			return NextResponse.json(
				{ error: allowance.reason ?? "Upload limit reached." },
				{ status: 429 },
			);
		}

		// Upload to Vercel Blob
		// Store in user-specific folder for better organization
		const blobPath = `continue-ai/${userId}/${Date.now()}-${filename}`;

		const result = await put(blobPath, blob, {
			access: "public",
			contentType,
		});

		// Return the blob info
		return NextResponse.json({
			url: result.url,
			pathname: result.pathname,
			filename,
			contentType,
			size: blob.size,
		});
	} catch (error) {
		console.error("File upload error:", error);
		return NextResponse.json(
			{
				error: "Failed to upload file",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
