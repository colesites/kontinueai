import type { NormalizedTranscript } from "../../types";
import { chatgptParser } from "./chatgpt";
import { claudeParser } from "./claude";
import { geminiParser } from "./gemini";
import { genericParser } from "./generic";
import { perplexityParser } from "./perplexity";
import type { ProviderParser } from "./types";

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

export async function importFromUrl(
	url: string,
): Promise<NormalizedTranscript> {
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

export type { ProviderParser };
export {
	chatgptParser,
	claudeParser,
	geminiParser,
	genericParser,
	perplexityParser,
};
