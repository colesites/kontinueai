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

// The request body is built by the same function the web client uses, so the
// two cannot drift (reasoning, image options, timezone, agent).
export {
  type ChatRequestBody,
  type ChatRequestBodyState,
  toChatRequestBody,
  trimMessagesToRetryTarget,
} from "@repo/core/chat-request";
