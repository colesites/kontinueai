import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { NormalizedTranscriptSchema } from "../../../../features/import/types";

const RequestSchema = z.object({
  transcript: NormalizedTranscriptSchema,
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
        { error: "Invalid transcript data" },
        { status: 400 }
      );
    }

    // The actual chat creation is handled by the Convex mutation on the client
    // This endpoint can be used for additional server-side validation or logging

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Import commit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

