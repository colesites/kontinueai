export type Role = "user" | "assistant";
export type MessageType = "text" | "code" | "image" | "file";
export type Confidence = "high" | "medium" | "low";

export type Platform =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "t3chat"
  | "deepseek"
  | "copilot"
  | "qwen"
  | "manus"
  | "grok"
  | "kimi"
  | "metaai";

export interface RawMessage {
  role: Role;
  content: string;
  images: string[];
  codes: Array<{ language: string; code: string }>;
  files: string[];
}

export interface Message {
  id: string;
  role: Role;
  type: MessageType;
  content?: string;
  url?: string;
  language?: string;
}

export interface ScrapeResult {
  title: string;
  site: Platform;
  messages: Message[];
  scrapedAt: string;
}

export interface ScrapeRequest {
  url: string;
}

export interface IngestRequest {
  url: string;
  site: Platform;
  title?: string;
  messages: RawMessage[];
}

export interface DebugInfo {
  lowConfidenceNodes: number;
  skippedNodes: number;
}
