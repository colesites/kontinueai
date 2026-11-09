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
  reasoning?: string;
  tool_calls?: KodeToolCall[];
  tool_call_id?: string;
  name?: string;
  createdAt?: number;
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

// "auto" lets the model decide; "required" forces some tool; "none" forbids tools.
// A function object forces that one tool (the checklist at the start of a task).
export type KodeToolChoice =
  | "auto"
  | "required"
  | "none"
  | { type: "function"; function: { name: string } };

type ClerkGlobal = { session?: { getToken: () => Promise<string | null> } | null };

/** Clerk session token for the Kontinue server (Clerk sets window.Clerk). */
export async function getSessionToken(): Promise<string | null> {
  const clerk = (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
  try {
    return (await clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

export async function sendKodeChat({
  messages,
  modelId,
  tools,
  toolChoice,
  systemContext,
  reasoningEnabled,
  kontinueServer = false,
  surface = "kode",
  fast = false,
  reasoningEffort,
  onEvent,
}: {
  messages: KodeChatMessage[];
  modelId: string;
  tools?: KodeToolDefinition[];
  toolChoice?: KodeToolChoice;
  systemContext?: string;
  reasoningEnabled?: boolean;
  /** Send through the Kontinue server (plan access + usage). Used by Kode. */
  kontinueServer?: boolean;
  /** Which server route: Kode (cost-metered) or the Home chat (per request). */
  surface?: "kode" | "home";
  /** Fast mode (server uses the model's fast variant when the plan allows). */
  fast?: boolean;
  /** Reasoning effort; the server maps it to the model's nearest level. */
  reasoningEffort?: string;
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
      reasoning_enabled: reasoningEnabled !== undefined ? reasoningEnabled : null,
      kontinue_server: kontinueServer,
      session_token: kontinueServer ? await getSessionToken() : null,
      fast,
      kontinue_surface: surface,
      reasoning_effort: reasoningEffort ?? null,
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
