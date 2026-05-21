import {
  smoothStream,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type StopCondition,
  type ToolSet,
} from "ai";
import { shouldStopAfterAnswer } from "./request-utils";

type ToolRuntimeOptions = {
  modelId: string;
  webSearchEnabled: boolean;
  supportsTools: boolean;
  hasImageGen: boolean;
  provider: string;
  shouldAttachWebSearchTool: boolean;
  tools: ToolSet;
  maxOutputTokens: number;
};

export type ToolRuntime = {
  requestedToolNames: string[];
  hasTools: boolean;
  shouldDisableTools: boolean;
  maxSteps: number;
  stopWhen: StopCondition<ToolSet>[];
};

export function resolveToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  const {
    modelId,
    webSearchEnabled,
    supportsTools,
    hasImageGen,
    provider,
    shouldAttachWebSearchTool,
    tools,
    maxOutputTokens,
  } = options;

  const requestedToolNames = Object.keys(tools);
  const hasTools = requestedToolNames.length > 0;
  const supportsRequestedTools =
    (!requestedToolNames.includes("perplexity_search") || shouldAttachWebSearchTool) &&
    (!requestedToolNames.includes("image_generation") ||
      (hasImageGen && provider === "openai"));

  const shouldDisableTools = hasTools && !supportsRequestedTools;
  if (shouldDisableTools) {
    console.warn(
      "[chat-debug] tools disabled because model does not support tool calling",
      {
        model: modelId,
        requestedToolNames,
      },
    );
  }

  if (webSearchEnabled && !supportsTools) {
    console.warn(
      `[chat-debug] web search enabled but tools are not supported by this model: ${modelId}`,
    );
  }

  console.log("[chat-debug] tools enabled", hasTools && !shouldDisableTools);

  const maxSteps = shouldAttachWebSearchTool ? 6 : 3;
  const stopWhen: StopCondition<ToolSet>[] =
    hasTools && !shouldDisableTools
      ? [
          stepCountIs(maxSteps),
          stopWhenOutputBudgetReached(maxOutputTokens),
          shouldStopAfterAnswer,
        ]
      : [];

  return {
    requestedToolNames,
    hasTools,
    shouldDisableTools,
    maxSteps,
    stopWhen,
  };
}

export function getTotalOutputTokens(
  steps: Array<{ usage?: { outputTokens?: number } }>,
): number {
  return steps.reduce((sum, step) => sum + (step.usage?.outputTokens ?? 0), 0);
}

export function stopWhenOutputBudgetReached(
  maxOutputTokens: number,
): StopCondition<ToolSet> {
  return ({ steps }) => getTotalOutputTokens(steps) >= maxOutputTokens;
}

type BuildStreamOptionsInput = {
  model: LanguageModel;
  systemPrompt: string;
  modelMessages: ModelMessage[];
  maxOutputTokens: number;
  tools: ToolSet;
  shouldDisableTools: boolean;
  hasTools: boolean;
  forceImageTool: boolean;
  forceWebSearchTool: boolean;
  stopWhen: StopCondition<ToolSet>[];
};

export function buildStreamOptions(options: BuildStreamOptionsInput) {
  const {
    model,
    systemPrompt,
    modelMessages,
    maxOutputTokens,
    tools,
    shouldDisableTools,
    hasTools,
    forceImageTool,
    forceWebSearchTool,
    stopWhen,
  } = options;

  return {
    model,
    system: systemPrompt,
    messages: modelMessages,
    maxTokens: maxOutputTokens,
    tools: shouldDisableTools ? undefined : hasTools ? tools : undefined,
    experimental_transform: smoothStream(),
    ...(forceImageTool
      ? {
          toolChoice: { type: "tool" as const, toolName: "image_generation" },
        }
      : forceWebSearchTool
        ? {
            toolChoice: {
              type: "tool" as const,
              toolName: "perplexity_search",
            },
          }
        : {}),
    ...(stopWhen.length > 0 && { stopWhen }),
    onStepFinish: ({
      finishReason,
      toolCalls,
      toolResults,
    }: {
      finishReason: string;
      toolCalls?: Array<{ toolName: string }>;
      toolResults?: unknown[];
    }) => {
      console.log("[chat-debug] step", {
        finishReason,
        toolCallNames: (toolCalls ?? []).map((toolCall) => toolCall.toolName),
        toolResultCount: (toolResults ?? []).length,
      });
    },
    onFinish: ({ finishReason, totalUsage, steps }: {
      finishReason: string;
      totalUsage: { outputTokens?: number };
      steps: Array<unknown>;
    }) => {
      const totalOutputTokens = totalUsage.outputTokens ?? 0;

      console.log("[chat-debug] stream finish", {
        finishReason,
        totalOutputTokens,
        maxOutputTokens,
        stepCount: steps.length,
      });

      if (totalOutputTokens > maxOutputTokens) {
        console.warn("[chat-debug] output token budget exceeded", {
          totalOutputTokens,
          maxOutputTokens,
        });
      }
    },
  };
}
