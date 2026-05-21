import {
  convertToModelMessages,
  streamText,
  type LanguageModel,
} from "ai";
import { gateway } from "@ai-sdk/gateway";
import { isProModel } from "@repo/ai/lib/model-pricing";
import { isPaidTier } from "@repo/core/plan-tier";
import { getAiGatewayModelsCached } from "./lib/model-utils";
import { getTokenLimitsByTier, getUserPlanTier } from "./lib/plan-limits";
import { getGatewayRuntimeConfig } from "./lib/gateway-runtime";
import {
  createInputTooLongResponse,
  getLastUserContent,
  hasUserFileAttachments,
  logDetailedError,
} from "./lib/request-utils";
import { getAuthContext, parseChatRouteInput } from "./lib/route-input";
import {
  buildStreamOptions,
  resolveToolRuntime,
} from "./lib/stream-runtime";
import { logFinalStreamOptions } from "./lib/stream-logging";
import { buildToolsAndPrompt } from "./lib/tools-config";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { userId, hasPlan } = await getAuthContext();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const {
      messages,
      modelId,
      webSearchEnabled: requestedWebSearchEnabled,
      imageAspectRatio,
      imageSize,
      userTimezone,
    } = await parseChatRouteInput(req);

    const lastUserContent = getLastUserContent(messages);
    console.log("[chat-debug] model string", modelId);

    const models = await getAiGatewayModelsCached();
    const requestedModel = models.find((model) => model.id === modelId);
    if (!requestedModel) {
      return new Response("Unknown model", { status: 400 });
    }

    const planTier = await getUserPlanTier(userId, hasPlan);
    const webSearchEnabled =
      isPaidTier(planTier) && requestedWebSearchEnabled;
    if (!isPaidTier(planTier) && hasUserFileAttachments(messages)) {
      return new Response("Starter or Pro plan required for file attachments", {
        status: 403,
      });
    }

    const isPremium = isProModel(requestedModel);
    if (!isPaidTier(planTier) && isPremium) {
      return new Response("Starter or Pro plan required for this model", {
        status: 403,
      });
    }

    const { maxInputTokens, maxOutputTokens, tierLabel } = getTokenLimitsByTier({
      planTier,
      isPremiumModel: isPremium,
    });

    const estimatedInputTokens = Math.ceil(lastUserContent.length / 4);
    if (estimatedInputTokens > maxInputTokens) {
      return createInputTooLongResponse({
        tierLabel,
        maxInputTokens,
        estimatedInputTokens,
      });
    }

    const gatewayRuntime = getGatewayRuntimeConfig();
    if (!gatewayRuntime) {
      return new Response("AI is not configured. Please try again later.", {
        status: 500,
      });
    }

    const modelInstance = gateway(modelId) as unknown as LanguageModel;
    const toolsConfig = buildToolsAndPrompt({
      requestedModel,
      modelId,
      webSearchEnabled,
      lastUserContent,
      maxOutputTokens,
      imageAspectRatio,
      imageSize,
      apiKey: gatewayRuntime.apiKey,
      gatewayOpenAIBaseUrl: gatewayRuntime.gatewayOpenAIBaseUrl,
      userTimezone,
    });

    const toolRuntime = resolveToolRuntime({
      modelId,
      webSearchEnabled,
      supportsTools: toolsConfig.supportsTools,
      hasImageGen: toolsConfig.hasImageGen,
      provider: toolsConfig.provider,
      shouldAttachWebSearchTool: toolsConfig.shouldAttachWebSearchTool,
      tools: toolsConfig.tools,
      maxOutputTokens,
    });

    const modelMessages = await convertToModelMessages(messages);
    const streamOptions = buildStreamOptions({
      model: modelInstance,
      systemPrompt: toolsConfig.systemPrompt,
      modelMessages,
      maxOutputTokens,
      tools: toolsConfig.tools,
      shouldDisableTools: toolRuntime.shouldDisableTools,
      hasTools: toolRuntime.hasTools,
      forceImageTool: toolsConfig.forceImageTool,
      forceWebSearchTool: toolsConfig.forceWebSearchTool,
      stopWhen: toolRuntime.stopWhen,
    });

    logFinalStreamOptions({
      modelId,
      planTier,
      requestedToolNames: toolRuntime.requestedToolNames,
      appliedToolNames:
        streamOptions.tools && typeof streamOptions.tools === "object"
          ? Object.keys(streamOptions.tools)
          : [],
      webSearchEnabled,
      hasWebSearchCapability: toolsConfig.hasWebSearch,
      supportsTools: toolsConfig.supportsTools,
      imageAspectRatio,
      imageSize,
      openaiImageToolSize: toolsConfig.openaiImageToolSize,
      forceWebSearchTool: toolsConfig.forceWebSearchTool,
      forceImageTool: !!toolsConfig.forceImageTool,
      stopWhenCount: toolRuntime.stopWhen.length,
      maxSteps: toolRuntime.maxSteps,
      systemPrompt: toolsConfig.systemPrompt,
      messageCount: modelMessages.length,
    });

    return streamText(streamOptions).toUIMessageStreamResponse({
      onError: (error) => {
        logDetailedError("UI message stream error", error);
        return "Tool execution failed.";
      },
    });
  } catch (error) {
    logDetailedError("Chat API error", error);
    return new Response("Internal server error", { status: 500 });
  }
}
