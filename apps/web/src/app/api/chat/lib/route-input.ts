import { auth } from "@clerk/nextjs/server";
import type { UIMessage } from "ai";
import { FREE_DEFAULT_MODEL_ID } from "@repo/ai/lib/models";
import { isAgentId, type AgentId } from "@repo/ai/lib/agents";

export type ChatRouteInput = {
  chatId: string | null;
  messages: UIMessage[];
  modelId: string;
  webSearchEnabled: boolean;
  imageAspectRatio: string | null;
  imageSize: string | null;
  userTimezone: string | null;
  agentId: AgentId | null;
};

type AuthResultWithOptionalHas = Awaited<ReturnType<typeof auth>> & {
  has?: (args: { plan: string }) => boolean;
  getToken?: (options?: { template?: string }) => Promise<string | null>;
};

export async function getAuthContext(): Promise<{
  userId: string | null;
  hasPlan?: (args: { plan: string }) => boolean;
  getToken?: (options?: { template?: string }) => Promise<string | null>;
}> {
  const authResult = (await auth()) as AuthResultWithOptionalHas;
  return {
    userId: authResult.userId,
    hasPlan: typeof authResult.has === "function" ? authResult.has : undefined,
    getToken:
      typeof authResult.getToken === "function" ? authResult.getToken : undefined,
  };
}

export async function parseChatRouteInput(req: Request): Promise<ChatRouteInput> {
  const body = (await req.json()) as {
    chatId?: string | null;
    messages: UIMessage[];
    model?: string;
    webSearchEnabled?: boolean;
    imageAspectRatio?: string | null;
    imageSize?: string | null;
    userTimezone?: string | null;
    agentId?: string | null;
  };

  return {
    chatId: typeof body.chatId === "string" && body.chatId.length > 0 ? body.chatId : null,
    messages: body.messages,
    modelId: body.model ?? FREE_DEFAULT_MODEL_ID,
    webSearchEnabled: !!body.webSearchEnabled,
    imageAspectRatio: body.imageAspectRatio ?? null,
    imageSize: body.imageSize ?? null,
    userTimezone:
      typeof body.userTimezone === "string" && body.userTimezone.length > 0
        ? body.userTimezone
        : null,
    agentId: isAgentId(body.agentId) ? body.agentId : null,
  };
}
