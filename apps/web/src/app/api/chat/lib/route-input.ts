import { auth } from "@clerk/nextjs/server";
import type { UIMessage } from "ai";
import { FREE_DEFAULT_MODEL_ID } from "@repo/ai/lib/models";

export type ChatRouteInput = {
  messages: UIMessage[];
  modelId: string;
  webSearchEnabled: boolean;
  imageAspectRatio: string | null;
  imageSize: string | null;
  userTimezone: string | null;
};

type AuthResultWithOptionalHas = Awaited<ReturnType<typeof auth>> & {
  has?: (args: { plan: string }) => boolean;
};

export async function getAuthContext(): Promise<{
  userId: string | null;
  hasPlan?: (args: { plan: string }) => boolean;
}> {
  const authResult = (await auth()) as AuthResultWithOptionalHas;
  return {
    userId: authResult.userId,
    hasPlan: typeof authResult.has === "function" ? authResult.has : undefined,
  };
}

export async function parseChatRouteInput(req: Request): Promise<ChatRouteInput> {
  const body = (await req.json()) as {
    messages: UIMessage[];
    model?: string;
    webSearchEnabled?: boolean;
    imageAspectRatio?: string | null;
    imageSize?: string | null;
    userTimezone?: string | null;
  };

  return {
    messages: body.messages,
    modelId: body.model ?? FREE_DEFAULT_MODEL_ID,
    webSearchEnabled: !!body.webSearchEnabled,
    imageAspectRatio: body.imageAspectRatio ?? null,
    imageSize: body.imageSize ?? null,
    userTimezone:
      typeof body.userTimezone === "string" && body.userTimezone.length > 0
        ? body.userTimezone
        : null,
  };
}
