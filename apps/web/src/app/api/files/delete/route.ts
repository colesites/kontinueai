import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

export async function DELETE(request: Request) {
  try {
    // Check authentication
    const authResult = await auth();
    const userId = authResult.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - please sign in" },
        { status: 401 }
      );
    }

    // Get pathname from query params
    const { searchParams } = new URL(request.url);
    const pathname = searchParams.get("pathname");

    if (!pathname) {
      return NextResponse.json(
        { error: "Pathname is required" },
        { status: 400 }
      );
    }

    // Verify the pathname belongs to this user (basic security check)
    if (!pathname.includes(`continue-ai/${userId}/`)) {
      return NextResponse.json(
        { error: "Unauthorized - you don't own this file" },
        { status: 403 }
      );
    }

    // Delete from Vercel Blob
    await del(pathname);

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    console.error("File deletion error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
