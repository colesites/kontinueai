import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getUserPlanTier } from "../../chat/lib/plan-limits";

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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

    // Reject free plan only if it's NOT an image (allow images for Canvas/Image-to-Video)
    if (planTier === "free" && !contentType.startsWith("image/")) {
      return NextResponse.json(
        {
          code: "FREE_PLAN_UPLOAD_DISABLED",
          error:
            "File uploads (except images) are available on Starter and Pro plans. Please upgrade to continue.",
        },
        { status: 403 },
      );
    }

    // Validate file size
    if (blob.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 5MB limit" },
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
      { status: 500 }
    );
  }
}
