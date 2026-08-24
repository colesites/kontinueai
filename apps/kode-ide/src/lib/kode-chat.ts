import { Channel, invoke } from "@tauri-apps/api/core";
import type { LanguageModelUsage } from "ai";
import { getActiveByokKeyForModel } from "@/lib/kode-byok";

// Incremental events emitted by the Rust `kode_chat` command as tokens arrive.
export type KodeStreamEvent =
  | { type: "reasoning"; delta: string }
  | { type: "content"; delta: string };

export type KodeChatRole = "user" | "assistant" | "tool" | "system";

// OpenAI-style tool call as returned by the model / replayed back to it.
export type KodeToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// OpenAI multimodal content parts (text + images) for attachment support.
export type KodeContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

// A chat message in the OpenAI shape. `content` is a string, or an array of
// parts for multimodal (image attachment) messages. `tool_calls` is set on
// assistant turns that requested tools; `tool_call_id` on `tool` result messages.
export type KodeChatMessage = {
  role: KodeChatRole;
  content: string | KodeContentPart[] | null;
  tool_calls?: KodeToolCall[];
  tool_call_id?: string;
  name?: string;
};

// OpenAI-style tool/function definition handed to the model.
export type KodeToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type KodeChatUsageResponse = {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
};

type KodeChatCommandResponse = {
  content: string;
  reasoning?: string;
  usage?: KodeChatUsageResponse;
  resolved_model_id: string;
  tool_calls?: KodeToolCall[] | null;
  finish_reason?: string | null;
};

export type KodeChatResponse = {
  content: string;
  reasoning?: string;
  usage?: LanguageModelUsage;
  resolvedModelId: string;
  toolCalls: KodeToolCall[];
  finishReason: string | null;
};

// "auto" lets the model decide; "required" forces it to call some tool this turn;
// "none" forbids tools. Used to force action on the first turn of file-work asks.
export type KodeToolChoice = "auto" | "required" | "none";

export async function sendKodeChat({
  messages,
  modelId,
  tools,
  toolChoice,
  systemContext,
  onEvent,
}: {
  messages: KodeChatMessage[];
  modelId: string;
  tools?: KodeToolDefinition[];
  toolChoice?: KodeToolChoice;
  systemContext?: string;
  onEvent?: (event: KodeStreamEvent) => void;
}): Promise<KodeChatResponse> {
  const channel = new Channel<KodeStreamEvent>();
  if (onEvent) {
    channel.onmessage = onEvent;
  }

  const activeByok = await getActiveByokKeyForModel(modelId);

  const response = await invoke<KodeChatCommandResponse>("kode_chat", {
    request: {
      model_id: modelId,
      messages,
      tools: tools && tools.length > 0 ? tools : null,
      tool_choice: tools && tools.length > 0 && toolChoice ? toolChoice : null,
      system_context: systemContext ?? null,
      byok_key: activeByok?.key ?? null,
      byok_provider: activeByok?.provider ?? null,
    },
    onEvent: channel,
  });

  return {
    content: response.content,
    reasoning: response.reasoning,
    resolvedModelId: response.resolved_model_id,
    usage: toLanguageModelUsage(response.usage),
    toolCalls: response.tool_calls ?? [],
    finishReason: response.finish_reason ?? null,
  };
}

function toLanguageModelUsage(
  usage: KodeChatUsageResponse | undefined,
): LanguageModelUsage | undefined {
  if (!usage) return undefined;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;

  return {
    inputTokenDetails: {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      noCacheTokens: inputTokens,
    },
    inputTokens,
    outputTokenDetails: {
      reasoningTokens,
      textTokens: Math.max(outputTokens - reasoningTokens, 0),
    },
    outputTokens,
    reasoningTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
  };
}
