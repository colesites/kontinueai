import { fetch as expoFetch } from "expo/fetch";

/**
 * Base URL of the Next.js web app, which hosts the streaming /api/chat route.
 * The mobile app shares the same Clerk instance and Convex deployment as the
 * web app, so a Clerk Bearer token authenticates these requests.
 *
 * In development point this at your machine's LAN address (e.g.
 * http://192.168.1.20:3000) so a physical device can reach the dev server.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://chat.kontinueai.com";

export const CHAT_API_URL = `${API_BASE_URL}/api/chat`;

/**
 * React Native's built-in fetch cannot stream response bodies; expo/fetch
 * implements the WinterCG spec and can. The AI SDK transport expects the
 * global fetch signature, hence the cast.
 */
export const streamingFetch = expoFetch as unknown as typeof globalThis.fetch;

export type ChatRequestBody = {
  chatId: string;
  model: string;
  webSearchEnabled: boolean;
  imageAspectRatio: string;
  imageSize: string | null;
  userTimezone: string | null;
  agentId: string | null;
};

export function toChatRequestBody(args: {
  chatId: string;
  model: string;
  webSearchEnabled?: boolean;
  agentId?: string | null;
}): ChatRequestBody {
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }
  return {
    chatId: args.chatId,
    model: args.model,
    webSearchEnabled: args.webSearchEnabled ?? false,
    imageAspectRatio: "auto",
    imageSize: null,
    userTimezone: timezone,
    agentId: args.agentId ?? null,
  };
}
