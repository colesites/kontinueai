import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { SharedLinkSchema, detectProvider } from "@repo/utils/url-safety";
import { importFromUrl } from "../../../../features/import/lib/providers";
import type { ImportPreviewResponse } from "../../../../features/import/types";

const RequestSchema = z.object({
  url: SharedLinkSchema,
});

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid URL. Please provide a valid HTTPS link." },
        { status: 400 }
      );
    }

    const { url } = parsed.data;
    const provider = detectProvider(url);

    try {
      // Attempt to import
      const transcript = await importFromUrl(url);

      // Many providers render messages client-side; if we got no messages, treat as blocked.
      if (!transcript.messages?.length) {
        return NextResponse.json({
          success: false,
          provider,
          title: "",
          messageCount: 0,
          previewMessages: [],
          error:
            "This share page likely blocks server-side reading (client-side rendered). Paste the transcript instead.",
          requiresManualPaste: true,
        } satisfies ImportPreviewResponse);
      }

      const response: ImportPreviewResponse = {
        success: true,
        provider,
        title: transcript.title,
        messageCount: transcript.messages.length,
        previewMessages: transcript.messages.slice(0, 5),
        transcript,
      };

      return NextResponse.json(response);
    } catch (fetchError) {
      // Import failed - suggest manual paste
      const errorMessage =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to import conversation";

      const response: ImportPreviewResponse = {
        success: false,
        provider,
        title: "",
        messageCount: 0,
        previewMessages: [],
        error:
          errorMessage === "No messages found in the shared link"
            ? "This share page likely blocks server-side reading. Paste the transcript instead."
            : errorMessage,
        requiresManualPaste: true,
      };

      return NextResponse.json(response);
    }
  } catch (error) {
    console.error("Import preview error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

