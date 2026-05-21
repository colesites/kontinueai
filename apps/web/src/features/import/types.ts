import { z } from "zod";
import type { Provider } from "@repo/utils/url-safety";

export const NormalizedMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  author: z.string().optional(),
  createdAt: z.number().optional(),
  order: z.number(),
});

export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

export const NormalizedTranscriptSchema = z.object({
  provider: z.string(),
  title: z.string(),
  messages: z.array(NormalizedMessageSchema),
  sourceUrl: z.string().optional(),
  fetchedAt: z.number(),
});

export type NormalizedTranscript = z.infer<typeof NormalizedTranscriptSchema>;

export interface ImportPreviewResponse {
  success: boolean;
  provider: Provider;
  title: string;
  messageCount: number;
  previewMessages: NormalizedMessage[];
  transcript?: NormalizedTranscript;
  error?: string;
  requiresManualPaste?: boolean;
}

export interface ImportState {
  status: "idle" | "scanning" | "previewing" | "importing" | "error" | "success";
  url: string;
  provider: Provider | null;
  preview: ImportPreviewResponse | null;
  error: string | null;
  chatId: string | null;
}

export type ImportAction =
  | { type: "SET_URL"; url: string }
  | { type: "START_SCAN" }
  | { type: "SCAN_SUCCESS"; preview: ImportPreviewResponse }
  | { type: "SCAN_ERROR"; error: string; requiresManualPaste?: boolean }
  | { type: "START_IMPORT" }
  | { type: "IMPORT_SUCCESS"; chatId: string }
  | { type: "IMPORT_ERROR"; error: string }
  | { type: "RESET" };

