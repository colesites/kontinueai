import type { NormalizedTranscript } from "../../types";

export interface ProviderParser {
  name: string;
  detect: (url: string) => boolean;
  fetch: (url: string) => Promise<string>;
  parse: (html: string, url: string) => Promise<NormalizedTranscript>;
}

export interface ParsedMessage {
  role: "system" | "user" | "assistant";
  content: string;
  author?: string;
  createdAt?: number;
}

