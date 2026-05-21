import { chatgptParser } from "./chatgpt";
import { geminiParser } from "./gemini";
import { claudeParser } from "./claude";
import { perplexityParser } from "./perplexity";
import { genericParser } from "./generic";
import type { ProviderParser } from "./types";
import type { NormalizedTranscript } from "../../types";

const parsers: ProviderParser[] = [
  chatgptParser,
  geminiParser,
  claudeParser,
  perplexityParser,
  genericParser, // Must be last (fallback)
];

export function getParserForUrl(url: string): ProviderParser {
  for (const parser of parsers) {
    if (parser.detect(url)) {
      return parser;
    }
  }
  return genericParser;
}

export async function importFromUrl(url: string): Promise<NormalizedTranscript> {
  const parser = getParserForUrl(url);

  try {
    const html = await parser.fetch(url);
    const transcript = await parser.parse(html, url);

    // Validate the result
    if (transcript.messages.length === 0) {
      throw new Error("No messages found in the shared link");
    }

    return transcript;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to import conversation");
  }
}

export {
  chatgptParser,
  geminiParser,
  claudeParser,
  perplexityParser,
  genericParser,
};
export type { ProviderParser };

