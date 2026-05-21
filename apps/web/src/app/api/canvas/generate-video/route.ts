import { auth } from "@clerk/nextjs/server";
import { experimental_generateVideo as generateVideo } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { VIDEO_MODELS } from "@repo/ai/lib/canvas-models";

export const maxDuration = 300;

/**
 * Type guard for provider errors from AI SDK
 */
function isProviderError(
  error: unknown,
): error is { providerResponse: unknown } {
  return (
    typeof error === "object" && error !== null && "providerResponse" in error
  );
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      prompt?: string;
      model?: string;
      quality?: "standard" | "pro";
      audio?: boolean;
      resolution?: string;
      aspectRatio?: string;
      duration?: number;
      image?: string;
    };

    if (!body.prompt || body.prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt is required (min 3 characters)" },
        { status: 400 },
      );
    }

    const defaultModel = VIDEO_MODELS[0];
    if (!defaultModel) {
      return NextResponse.json(
        { error: "No video models configured" },
        { status: 500 },
      );
    }
    const modelId = body.model ?? defaultModel.id;
    const validModel = VIDEO_MODELS.find((m) => m.id === modelId);
    if (!validModel) {
      return NextResponse.json(
        { error: `Invalid video model: ${modelId}` },
        { status: 400 },
      );
    }

    const duration = body.duration ?? 5;

    // Ensure AI Gateway key is set
    const apiKey =
      process.env.VERCEL_AI_GATEWAY_API_KEY ??
      process.env.AI_GATEWAY_API_KEY ??
      process.env.AI_GATEWAY_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI Gateway key not configured" },
        { status: 500 },
      );
    }
    // Set for subsequent library calls
    process.env.AI_GATEWAY_API_KEY = apiKey;

    // Standardized resolution/ratio types
    const resolution = (body.resolution || "1280x720") as `${number}x${number}`;
    const aspectRatio = (body.aspectRatio || "16:9") as `${number}:${number}`;

    const promptParam = body.image 
      ? { text: body.prompt, image: body.image } 
      : body.prompt;

    // ── Provider-Specific Params ─────────────────────────────

    let result;
    const model = gateway.video(modelId);

    if (modelId.startsWith("google/")) {
      // Google Veo: 4/6/8s. Prefers resolution over aspectRatio.
      const veoDuration = [4, 6, 8].includes(duration) ? duration : 4;
      result = await generateVideo({
        model,
        prompt: promptParam,
        duration: veoDuration,
        resolution,
        providerOptions: {
          vertex: {
            generateAudio: body.audio ?? false,
            pollTimeoutMs: 600000,
          },
        },
      });
    } else if (modelId.startsWith("klingai/")) {
      // KlingAI: 5/10s. Uses aspectRatio.
      const klingDuration = duration > 5 ? 10 : 5;
      result = await generateVideo({
        model,
        prompt: promptParam,
        aspectRatio,
        duration: klingDuration,
        providerOptions: {
          klingai: {
            mode: body.quality === "pro" ? "pro" : "std",
            pollTimeoutMs: 600000,
          },
        },
      });
    } else if (modelId.startsWith("alibaba/")) {
      // Wan: 1-15s. Uses resolution exclusively.
      result = await generateVideo({
        model,
        prompt: promptParam,
        resolution,
        duration,
        providerOptions: {
          alibaba: {
            promptExtend: true,
            pollTimeoutMs: 600000,
          },
        },
      });
    } else if (modelId.startsWith("xai/")) {
      // Grok: Supports both.
      result = await generateVideo({
        model,
        prompt: promptParam,
        aspectRatio,
        resolution,
        duration,
        providerOptions: {
          xai: {
            pollTimeoutMs: 600000,
          },
        },
      });
    } else if (modelId.startsWith("bytedance/")) {
      // Seedance: Supports both.
      result = await generateVideo({
        model,
        prompt: promptParam,
        aspectRatio,
        resolution,
        duration,
        providerOptions: {
          bytedance: {
            generateAudio: body.audio ?? false,
            pollTimeoutMs: 600000,
          },
        },
      });
    } else {
      // Fallback
      result = await generateVideo({
        model,
        prompt: promptParam,
        aspectRatio,
        duration,
      });
    }

    if (!result.video) {
      console.error("[canvas/generate-video] Model returned no video data");
      return NextResponse.json(
        { error: "Model failed to return a video." },
        { status: 500 },
      );
    }

    // Save with correct media type and extension
    const videoData = result.video;
    const mediaType = videoData.mediaType || "video/mp4";
    const extension = mediaType.split("/")[1] || "mp4";
    const buffer = Buffer.from(videoData.uint8Array);
    const filename = `canvas/vid_${Date.now()}_${userId.slice(-6)}.${extension}`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: mediaType,
    });

    console.log(
      "[canvas/generate-video] Successfully generated video:",
      blob.url,
    );

    return NextResponse.json({
      mediaUrl: blob.url,
      pathname: blob.pathname,
      mediaType: "video",
      modelId,
      duration,
    });
  } catch (error) {
    console.error("[canvas/generate-video] Fatal Error:", error);

    let errorMessage = "Generation failed";
    if (error instanceof Error) {
      errorMessage = error.message;
      if (isProviderError(error)) {
        console.error(
          "[canvas/generate-video] Provider response observed:",
          JSON.stringify(error.providerResponse),
        );
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
