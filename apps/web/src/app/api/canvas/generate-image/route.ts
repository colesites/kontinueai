import { gateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import { auth } from "@clerk/nextjs/server";
import { IMAGE_MODELS, resolveCanvasModelId } from "@repo/ai/lib/canvas-models";
import { fetchAiGatewayModels } from "@repo/ai/lib/model-capabilities";
import { api as convexApi } from "@repo/convex/convex/_generated/api";
import { canAccessPlanFeature } from "@repo/core/plan-access";
import { putPublicObject } from "@web/lib/object-storage";
import {
	experimental_generateImage as generateImage,
	generateText,
	stepCountIs,
	type ToolSet,
} from "ai";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { getUserPlanTier } from "../../chat/lib/plan-limits";
import { toOpenAIImageSize } from "../../chat/lib/request-utils";
import {
	apiError,
	apiErrorResponse,
	toGenerationError,
} from "../../lib/api-error";
import { resolveReferenceImages } from "../../lib/reference-images";

export const maxDuration = 120;

export async function POST(req: Request) {
	try {
		const { userId, has, getToken } = await auth();
		if (!userId) {
			return apiError("UNAUTHORIZED");
		}
		const convexToken = (await getToken({ template: "convex" })) ?? undefined;
		const planTier = await getUserPlanTier(userId, has, convexToken);
		if (!canAccessPlanFeature(planTier, "canvas")) {
			return apiError("PLAN_REQUIRED", {
				title: "Canvas is a Pro feature",
				message:
					"Image and video generation in Canvas comes with Pro and Max. Upgrade to start creating.",
				upgradeTo: "pro",
			});
		}
		if (!convexToken) return apiError("UNAUTHORIZED");

		const body = (await req.json()) as {
			prompt?: string;
			model?: string;
			aspectRatio?: string;
			image?: string;
			images?: string[];
		};

		if (!body.prompt || body.prompt.trim().length < 3) {
			return apiError("INVALID_REQUEST", {
				title: "Add a prompt",
				message: "Describe the image you want in at least 3 characters.",
			});
		}

		const defaultModel = IMAGE_MODELS[0];
		if (!defaultModel) {
			console.error("[canvas/generate-image] No image models configured");
			return apiError("SERVICE_UNAVAILABLE");
		}
		const modelId = body.model ?? defaultModel.id;
		const validModel = IMAGE_MODELS.find((m) => m.id === modelId);
		if (!validModel) {
			return apiError("INVALID_REQUEST", {
				title: "Model not available",
				message:
					"That image model isn't available. Pick another one and try again.",
			});
		}
		const refs = resolveReferenceImages(body, validModel, planTier);
		if ("error" in refs) return refs.error;
		const referenceImages = refs.images;

		// Resolve branded K-Image id → underlying gateway model. The branded id is
		// kept for the response/DB so the provider is never surfaced to the client.
		const resolvedModelId = resolveCanvasModelId(modelId);

		// Ensure AI Gateway key is set
		const apiKey =
			process.env.VERCEL_AI_GATEWAY_API_KEY ??
			process.env.AI_GATEWAY_API_KEY ??
			process.env.AI_GATEWAY_TOKEN;
		if (!apiKey) {
			console.error("[canvas/generate-image] AI Gateway key not configured");
			return apiError("SERVICE_UNAVAILABLE");
		}

		// Check limits and credits BEFORE paying the provider.
		const allowance = await fetchQuery(
			convexApi.canvas.checkGenerationAllowance,
			{ mediaType: "image", seconds: 0, modelId },
			{ token: convexToken },
		);
		if (!allowance.ok) return apiErrorResponse(allowance.error);
		if (!process.env.AI_GATEWAY_API_KEY) {
			process.env.AI_GATEWAY_API_KEY = apiKey;
		}

		// Fetch gateway metadata to determine if this is a language or image model
		const gatewayModels = await fetchAiGatewayModels().catch((err) => {
			console.error(
				"[canvas/generate-image] Gateway models fetch failed:",
				err,
			);
			return [];
		});
		const modelInfo = gatewayModels.find((m) => m.id === resolvedModelId);

		// Fallback: models with these keywords are typically language models in the gateway
		// when they are NOT recognized as type "image".
		const isLanguageModel = modelInfo
			? modelInfo.type === "language"
			: resolvedModelId.includes("gpt-5") ||
				(resolvedModelId.includes("gemini") &&
					!resolvedModelId.includes("-image") &&
					!resolvedModelId.includes("imagen"));

		let mediaUrl: string;
		let pathname: string | undefined;

		if (isLanguageModel) {
			const gatewayOpenAIBaseUrl =
				process.env.AI_GATEWAY_OPENAI_BASE_URL ??
				"https://ai-gateway.vercel.sh/v1";
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

			const messages = referenceImages.length
				? [
						{
							role: "user" as const,
							content: [
								{
									type: "text" as const,
									text: `Generate a high-quality image based on this prompt: ${body.prompt}. Use the attached reference image${referenceImages.length > 1 ? "s" : ""} and the image_generation tool.`,
								},
								...referenceImages.map((url) => ({
									type: "image" as const,
									image: new URL(url),
								})),
							],
						},
					]
				: undefined;

			const { steps } = await generateText({
				model: gateway(resolvedModelId) as Parameters<
					typeof generateText
				>[0]["model"],
				...(messages
					? { messages }
					: {
							prompt: `Generate a high-quality image based on this prompt: ${body.prompt}. Use the image_generation tool.`,
						}),
				tools: {
					image_generation: imageTool as unknown as ToolSet[string],
				},
				stopWhen: stepCountIs(5),
				toolChoice: "required",
			});

			// Find the image generation result
			const toolStep = steps.find((s) =>
				s.toolResults.some((r) => r.toolName === "image_generation"),
			);
			if (!toolStep) throw new Error("No tool execution steps found");

			const toolResult = toolStep.toolResults.find(
				(r) => r.toolName === "image_generation",
			);

			if (!toolResult || !("result" in toolResult) || !toolResult.result) {
				throw new Error(
					"Tool-based image generation failed to return a result",
				);
			}

			// Safely access the image data from the tool result
			interface ImageToolResult {
				image?: string | { uint8Array?: Uint8Array | number[] };
			}
			const imageData = (toolResult.result as ImageToolResult).image;

			if (!imageData) {
				throw new Error(
					"Tool-based image generation failed to return an image",
				);
			}

			// If the tool returns a URL, we use it directly or re-upload to our blob
			if (
				typeof imageData === "string" &&
				(imageData.startsWith("http") || imageData.startsWith("data:"))
			) {
				mediaUrl = imageData;
			} else if (
				typeof imageData === "object" &&
				imageData !== null &&
				"uint8Array" in imageData
			) {
				const uint8Array = imageData.uint8Array;
				if (!uint8Array)
					throw new Error("uint8Array is missing in tool result object");
				const buffer = Buffer.from(uint8Array as Uint8Array);
				const filename = `canvas/img_${Date.now()}_${userId.slice(-6)}.png`;
				const blob = await putPublicObject(filename, buffer, "image/png");
				mediaUrl = blob.url;
				pathname = blob.pathname;
			} else {
				throw new Error("Unsupported image data format from tool");
			}
		} else {
			// Every image model, K-Image included, goes through the AI Gateway.
			const imageModel = gateway.imageModel(resolvedModelId);
			const result = await generateImage({
				model: imageModel,
				prompt: referenceImages.length
					? { text: body.prompt || "", images: referenceImages }
					: body.prompt || "",
				aspectRatio: (body.aspectRatio || "1:1") as `${number}:${number}`,
				n: 1,
			}).catch((err) => {
				// Surface the real provider error (e.g. unknown model / no image
				// endpoint on OpenRouter) instead of a generic 500.
				console.error(
					`[canvas/generate-image] generation failed for ${resolvedModelId}:`,
					err,
				);
				throw err;
			});

			if (!result.images || result.images.length === 0) {
				return apiError("UNKNOWN", {
					message: "The model didn't return an image. Please try again.",
				});
			}

			const imageData = result.images[0];
			if (!imageData) {
				return apiError("UNKNOWN", {
					message: "The model didn't return an image. Please try again.",
				});
			}
			const buffer = Buffer.from(imageData.uint8Array);
			const filename = `canvas/img_${Date.now()}_${userId.slice(-6)}.png`;

			const blob = await putPublicObject(filename, buffer, "image/png");

			mediaUrl = blob.url;
			pathname = blob.pathname;
		}

		await fetchMutation(
			convexApi.canvas.deductCredits,
			{ mediaType: "image", seconds: 0, modelId },
			{ token: convexToken },
		);

		return NextResponse.json({
			mediaUrl,
			pathname,
			mediaType: "image",
			modelId,
		});
	} catch (error) {
		console.error("[canvas/generate-image] Error:", error);
		return apiErrorResponse(toGenerationError(error));
	}
}
