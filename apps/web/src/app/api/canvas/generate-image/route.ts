import { auth } from "@clerk/nextjs/server";
import { 
  experimental_generateImage as generateImage, 
  generateText 
} from "ai";
import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  IMAGE_MODELS,
  resolveCanvasModelId,
  isKontinueCanvasModel,
} from "@repo/ai/lib/canvas-models";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { toOpenAIImageSize } from "../../chat/lib/request-utils";
import { fetchAiGatewayModels } from "@repo/ai/lib/model-capabilities";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      prompt?: string;
      model?: string;
      aspectRatio?: string;
      image?: string;
    };

    if (!body.prompt || body.prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "Prompt is required (min 3 characters)" },
        { status: 400 },
      );
    }

    const defaultModel = IMAGE_MODELS[0];
    if (!defaultModel) {
      return NextResponse.json(
        { error: "No image models configured" },
        { status: 500 },
      );
    }
    const modelId = body.model ?? defaultModel.id;
    const validModel = IMAGE_MODELS.find((m) => m.id === modelId);
    if (!validModel) {
      return NextResponse.json(
        { error: `Invalid image model: ${modelId}` },
        { status: 400 },
      );
    }
    // Resolve branded K-Image id → underlying gateway model. The branded id is
    // kept for the response/DB so the provider is never surfaced to the client.
    const resolvedModelId = resolveCanvasModelId(modelId);

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
    if (!process.env.AI_GATEWAY_API_KEY) {
      process.env.AI_GATEWAY_API_KEY = apiKey;
    }

    // Fetch gateway metadata to determine if this is a language or image model
    const gatewayModels = await fetchAiGatewayModels().catch((err) => {
      console.error("[canvas/generate-image] Gateway models fetch failed:", err);
      return [];
    });
    const modelInfo = gatewayModels.find(m => m.id === resolvedModelId);

    // Fallback: models with these keywords are typically language models in the gateway
    // when they are NOT recognized as type "image".
    const isLanguageModel = modelInfo 
      ? modelInfo.type === "language" 
      : (resolvedModelId.includes("gpt-5") ||
         (resolvedModelId.includes("gemini") && !resolvedModelId.includes("-image") && !resolvedModelId.includes("imagen")));

    let mediaUrl: string;
    let pathname: string | undefined;

    if (isLanguageModel) {
      const gatewayOpenAIBaseUrl = process.env.AI_GATEWAY_OPENAI_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
      const openaiViaGateway = createOpenAI({
        apiKey,
        baseURL: gatewayOpenAIBaseUrl,
      });

      const size = toOpenAIImageSize(body.aspectRatio);
      
      // Specify tool definition as a variable to help with typing
      const imageTool = openaiViaGateway.tools.imageGeneration({
        outputFormat: "webp",
        quality: "high",
        size: size === "auto" ? "auto" : size,
      });

      const messages = body.image ? [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: `Generate a high-quality image based on this prompt: ${body.prompt}. Use the image_generation tool.` },
            { type: "image" as const, image: new URL(body.image) }
          ]
        }
      ] : undefined;

      const { steps } = await generateText({
        model: gateway(resolvedModelId) as Parameters<typeof generateText>[0]["model"],
        ...(messages ? { messages } : { prompt: `Generate a high-quality image based on this prompt: ${body.prompt}. Use the image_generation tool.` }),
        tools: {
          image_generation: imageTool,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ maxSteps: 5 } as any),
        toolChoice: "required",
      });

      // Find the image generation result
      const toolStep = steps.find(s => s.toolResults.some(r => r.toolName === "image_generation"));
      if (!toolStep) throw new Error("No tool execution steps found");

      const toolResult = toolStep.toolResults.find(r => r.toolName === "image_generation");

      if (!toolResult || !("result" in toolResult) || !toolResult.result) {
        throw new Error("Tool-based image generation failed to return a result");
      }

      // Safely access the image data from the tool result
      interface ImageToolResult {
        image?: string | { uint8Array?: Uint8Array | number[] };
      }
      const imageData = (toolResult.result as ImageToolResult).image;
      
      if (!imageData) {
        throw new Error("Tool-based image generation failed to return an image");
      }
      
      // If the tool returns a URL, we use it directly or re-upload to our blob
      if (typeof imageData === "string" && (imageData.startsWith("http") || imageData.startsWith("data:"))) {
         mediaUrl = imageData;
      } else if (typeof imageData === "object" && imageData !== null && "uint8Array" in imageData) {
        const uint8Array = imageData.uint8Array;
        if (!uint8Array) throw new Error("uint8Array is missing in tool result object");
        const buffer = Buffer.from(uint8Array as Uint8Array);
        const filename = `canvas/img_${Date.now()}_${userId.slice(-6)}.png`;
        const blob = await put(filename, buffer, {
          access: "public",
          contentType: "image/png",
        });
        mediaUrl = blob.url;
        pathname = blob.pathname;
      } else {
        throw new Error("Unsupported image data format from tool");
      }
    } else {
      // K-Image routes through OpenRouter; every other model uses the AI Gateway.
      const useOpenRouter = isKontinueCanvasModel(modelId);
      if (useOpenRouter && !process.env.OPEN_ROUTER) {
        return NextResponse.json(
          { error: "K-Image is not configured (missing OPEN_ROUTER key)." },
          { status: 500 },
        );
      }
      const imageModel = useOpenRouter
        ? createOpenRouter({ apiKey: process.env.OPEN_ROUTER }).imageModel(
            resolvedModelId,
            // Grok Imagine only supports image OUTPUT; the provider defaults to
            // modalities ["image","text"] which 404s. Override to image-only.
            { extraBody: { modalities: ["image"] } },
          )
        : gateway.imageModel(resolvedModelId);
      const result = await generateImage({
        model: imageModel,
        prompt: body.image
          ? { text: body.prompt || "", images: [body.image] }
          : (body.prompt || ""),
        aspectRatio: (body.aspectRatio || "1:1") as `${number}:${number}`,
        n: 1,
      }).catch((err) => {
        // Surface the real provider error (e.g. unknown model / no image
        // endpoint on OpenRouter) instead of a generic 500.
        console.error(
          `[canvas/generate-image] generation failed for ${resolvedModelId} (via ${useOpenRouter ? "openrouter" : "gateway"}):`,
          err,
        );
        throw err;
      });

      if (!result.images || result.images.length === 0) {
        return NextResponse.json(
          { error: "No image generated" },
          { status: 500 },
        );
      }

      const imageData = result.images[0];
      if (!imageData) {
        return NextResponse.json(
          { error: "No image generated" },
          { status: 500 },
        );
      }
      const buffer = Buffer.from(imageData.uint8Array);
      const filename = `canvas/img_${Date.now()}_${userId.slice(-6)}.png`;

      const blob = await put(filename, buffer, {
        access: "public",
        contentType: "image/png",
      });
      
      mediaUrl = blob.url;
      pathname = blob.pathname;
    }

    return NextResponse.json({
      mediaUrl,
      pathname,
      mediaType: "image",
      modelId,
    });
  } catch (error) {
    console.error("[canvas/generate-image] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate image",
      },
      { status: 500 },
    );
  }
}
