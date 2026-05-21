"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { generateText, createGateway } from "@repo/ai";

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v1";
const FIRECRAWL_WAIT_FOR_MS = 5000;
const SCRAPE_MAX_RETRIES = 3;
const SCRAPE_RETRY_DELAY_MS = 3000;
const NORMALIZER_CHUNK_CHAR_LIMIT = 18_000;

type ParsedMessage = { role: "user" | "assistant"; content: string };
type ImportProgressReporter = (percent: number, stage: string) => Promise<void>;
type ChunkProgressReporter = (
  completedChunks: number,
  totalChunks: number,
) => Promise<void>;

// ============================================================================
// SYSTEM PROMPT FOR CHAT NORMALIZATION
// ============================================================================

const NORMALIZER_SYSTEM_PROMPT = `You are a strict chat transcript normalizer.
Your goal is to extract ONLY the conversation between the User and the AI from a raw web scrape.

INPUT: Raw markdown that may contain:
- Headers (e.g., "Chat with Gemini", "Claude - My Chat")
- Footers (copyright, terms, links)
- UI Chrome (buttons like "Copy", "Regenerate", "Share", "Sign in")
- Metadata (timestamps, model names)

OUTPUT: A strict sequence of messages in this EXACT format:

[USER]:
<user message content>

[ASSISTANT]:
<ai response content>

RULES:
1.  **REMOVE ALL HEADERS & FOOTERS**: Delete anything that is not part of the actual conversation flow.
2.  **REMOVE UI TEXT**: Delete "Copy code", "Regenerate response", "Share", "bad/good response" buttons text.
3.  **STRICT ROLES**: 
    - The person asking questions is [USER].
    - The AI answering is [ASSISTANT].
    - Look for specific markers like "You said:", "ChatGPT said:", "User:", "Assistant:", "Gemini:", "Perplexity:" to identify who is speaking.
    - If markers are unclear, strictly alternate between [USER] and [ASSISTANT] starting with [USER].
    - [USER] messages usually come first.
    - [ASSISTANT] messages usually follow.
4.  **PRESERVE CONTENT**: 
    - Keep the actual message content (code blocks, markdown tables, bold text) EXACTLY as is. Do not summarize or rewrite.
    - **IMAGES**: strictly PRESERVE all markdown images in the format ![alt](url). Do NOT remove them.
    - **DIAGRAMS/CODE**: strictly PRESERVE all code blocks and diagrams (Mermaid, ASCII), even if they constitute the entire message.
5.  **NO EXTRA TEXT**: Do not add "Here is the transcript" or "Summary:". Just the bracketed labels and content.
6.  **CODE BLOCKS**: If there is code, keep it inside standard \`\`\` blocks. Do NOT put [USER] or [ASSISTANT] tags *inside* a code block. Ensure language tags (like \`\`\`mermaid\` or \`\`\`typescript\`) are preserved.

EXAMPLE INPUT:
"Chat with Claude
User
Hello there
Claude
Hi! How can I help?
Copy
Regenerate"

EXAMPLE OUTPUT:
[USER]:
Hello there

[ASSISTANT]:
Hi! How can I help?
`;

// ============================================================================
// LLM NORMALIZATION (ALL PROVIDERS)
// ============================================================================

function getLLMModel() {
  const apiKey = process.env.AI_GATEWAY_TOKEN;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_TOKEN is not set");
  }
  const gw = createGateway({ apiKey });
  const modelId = "google/gemini-2.0-flash-001";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return gw(modelId) as any;
}

async function normalizeTranscriptChunkWithLLM(markdownChunk: string) {
  const { text } = await generateText({
    model: getLLMModel(),
    system: NORMALIZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Please normalize this transcript:\n\n${markdownChunk}`,
      },
    ],
    // @ts-expect-error - explicitly supported by Vercel AI SDK even if types lag
    maxTokens: 12288,
  });

  return text.trim();
}

async function normalizeTranscriptChunkWithContext(
  markdownChunk: string,
  continuationRole: "user" | "assistant" | null,
) {
  if (!continuationRole) {
    return normalizeTranscriptChunkWithLLM(markdownChunk);
  }

  const continuationHint = `The previous chunk ended with [${continuationRole.toUpperCase()}]. If this chunk starts mid-message, continue that same role until a clear speaker switch is present.`;

  const { text } = await generateText({
    model: getLLMModel(),
    system: NORMALIZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${continuationHint}\n\nPlease normalize this transcript:\n\n${markdownChunk}`,
      },
    ],
    // @ts-expect-error - explicitly supported by Vercel AI SDK even if types lag
    maxTokens: 12288,
  });

  return text.trim();
}

// ============================================================================
// FAST PARSER + CHUNKING
// ============================================================================

function splitMarkdownIntoChunks(markdown: string, maxChars: number): string[] {
  if (markdown.length <= maxChars) {
    return [markdown];
  }

  const chunks: string[] = [];
  let currentChunk = "";
  const paragraphs = markdown.split(/\n{2,}/);

  const pushCurrentChunk = () => {
    const trimmed = currentChunk.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    currentChunk = "";
  };

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    const candidate = currentChunk
      ? `${currentChunk}\n\n${trimmedParagraph}`
      : trimmedParagraph;

    if (candidate.length <= maxChars) {
      currentChunk = candidate;
      continue;
    }

    pushCurrentChunk();

    if (trimmedParagraph.length <= maxChars) {
      currentChunk = trimmedParagraph;
      continue;
    }

    for (let i = 0; i < trimmedParagraph.length; i += maxChars) {
      chunks.push(trimmedParagraph.slice(i, i + maxChars).trim());
    }
  }

  pushCurrentChunk();

  if (chunks.length === 0) {
    return [markdown];
  }

  return chunks;
}

function mergeAdjacentSameRoleMessages(messages: ParsedMessage[]): ParsedMessage[] {
  const merged: ParsedMessage[] = [];
  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    const previous = merged[merged.length - 1];
    if (!previous || previous.role !== message.role) {
      merged.push({ role: message.role, content });
      continue;
    }
    previous.content = `${previous.content}\n\n${content}`.trim();
  }
  return merged;
}

function chunkStartsWithExplicitSpeaker(chunk: string): boolean {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    if (/^\[(?:user|assistant)\]:/i.test(line)) {
      return true;
    }

    const roleMatch = line.match(ROLE_HEADER_REGEX);
    if (roleMatch) {
      if (normalizeRoleLabel(roleMatch[1])) {
        return true;
      }
      if (isLikelyColonSpeakerLabel(roleMatch[1])) {
        return true;
      }
    }

    if (resolveStandaloneRoleLine(line) || extractStandaloneSpeakerLabel(line)) {
      return true;
    }

    if (/^```/.test(line)) {
      break;
    }
  }

  return false;
}

function looksLikeUserPrompt(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;

  if (
    /^(can|could|would|should|please|what|why|how|when|where|who|write|give|show|help|create|generate|explain|tell|summarize|fix)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  if (trimmed.length <= 500 && /\?\s*$/.test(trimmed)) {
    return true;
  }

  return false;
}

function looksLikeAssistantContinuation(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;

  if (/^([,.;:)\]\-]|\d+\.\s|[-*]\s|```|>)/.test(trimmed)) {
    return true;
  }
  if (/^[a-z]/.test(trimmed) && trimmed.length > 120) {
    return true;
  }
  if (trimmed.length > 600 && !looksLikeUserPrompt(trimmed)) {
    return true;
  }

  return false;
}

function repairLikelyRoleDrift(messages: ParsedMessage[]): ParsedMessage[] {
  const repaired = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => Boolean(message.content));

  for (let index = 0; index < repaired.length; index += 1) {
    const previous = repaired[index - 1];
    const current = repaired[index];
    const next = repaired[index + 1];

    if (!current) continue;
    if (current.role !== "user" || previous?.role !== "assistant") {
      continue;
    }

    const hasSuspiciousPattern =
      next?.role === "user" ||
      next === undefined ||
      next?.role === "assistant";

    if (!hasSuspiciousPattern) {
      continue;
    }

    const longCandidate = current.content.length >= 180;
    const likelyPrompt = looksLikeUserPrompt(current.content);
    const likelyContinuation = looksLikeAssistantContinuation(current.content);

    if ((longCandidate && !likelyPrompt) || likelyContinuation) {
      current.role = "assistant";
    }
  }

  return mergeAdjacentSameRoleMessages(repaired);
}

async function normalizeTranscriptWithLLM(
  markdown: string,
  onChunkProgress?: ChunkProgressReporter,
): Promise<ParsedMessage[]> {
  const chunks = splitMarkdownIntoChunks(markdown, NORMALIZER_CHUNK_CHAR_LIMIT);
  if (chunks.length === 0) {
    return [];
  }

  const normalizedChunks: string[] = [];
  const parsedMessages: ParsedMessage[] = [];
  let continuationRole: "user" | "assistant" | null = null;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) continue;
    const normalizedChunk = await normalizeTranscriptChunkWithContext(
      chunk,
      continuationRole,
    );
    normalizedChunks.push(normalizedChunk);

    const parsedChunk = parseNormalizedTranscript(normalizedChunk).messages;
    const firstParsed = parsedChunk[0];
    if (firstParsed) {
      const shouldForceContinuationRole =
        continuationRole !== null &&
        firstParsed.role !== continuationRole &&
        !chunkStartsWithExplicitSpeaker(chunk);

      if (shouldForceContinuationRole) {
        const forcedRole = continuationRole as "user" | "assistant";
        parsedChunk[0] = {
          ...firstParsed,
          role: forcedRole,
        };
      }

      parsedMessages.push(...parsedChunk);
      const merged = mergeAdjacentSameRoleMessages(parsedMessages);
      const last = merged[merged.length - 1];
      continuationRole = last ? last.role : continuationRole;
    }

    if (onChunkProgress) {
      await onChunkProgress(index + 1, chunks.length);
    }
  }

  const mergedParsed = repairLikelyRoleDrift(
    mergeAdjacentSameRoleMessages(parsedMessages),
  );
  if (mergedParsed.length > 0) {
    return mergedParsed;
  }

  const fallbackNormalizedText = normalizedChunks.join("\n\n").trim();
  return mergeAdjacentSameRoleMessages(
    parseNormalizedTranscript(fallbackNormalizedText).messages,
  );
}

const USER_LABELS = new Set([
  "user",
  "you",
  "human",
  "me",
  "question",
  "prompt",
]);

const ASSISTANT_LABELS = new Set([
  "assistant",
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "ai",
  "bot",
  "model",
]);

const ROLE_HEADER_REGEX =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*([a-z][a-z0-9 _\-/.()]{1,48})(?:\*\*)?\s*[:：]\s*(.*)$/i;

const STANDALONE_ROLE_LINE_ALLOWED_TOKENS = new Set([
  ...USER_LABELS,
  ...ASSISTANT_LABELS,
  "said",
]);

const NON_SPEAKER_LABEL_TOKENS = new Set([
  "copy",
  "share",
  "regenerate",
  "edit",
  "delete",
  "retry",
  "export",
  "download",
  "continue",
  "sources",
  "reasoning",
  "search",
  "prompt",
  "response",
  "feedback",
  "like",
  "dislike",
  "signin",
  "sign",
  "login",
]);

type FirecrawlExtractionResult = {
  title: string;
  messages: ParsedMessage[];
  metadata: unknown;
  timingsMs: {
    total: number;
    firecrawl: number;
    normalization?: number;
  };
  extractionStrategy: "regex" | "normalized_markers" | "llm";
};

type FirecrawlScrapeApiResponse = {
  success?: boolean;
  error?: string;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      [key: string]: unknown;
    } | null;
  };
};

function normalizeRoleLabel(
  label: string | undefined,
): "user" | "assistant" | null {
  if (!label) return null;
  const normalized = label
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bsaid\b$/, "")
    .trim();

  const tokens = normalized
    .split(/[ _-]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.some((token) => USER_LABELS.has(token))) return "user";
  if (tokens.some((token) => ASSISTANT_LABELS.has(token))) return "assistant";
  return null;
}

function parseRoleLabeledTranscript(markdown: string): {
  messages: ParsedMessage[];
} {
  const lines = markdown.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentParts: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    if (!currentRole) return;
    const content = currentParts.join("\n").trim();
    if (!content) return;
    messages.push({ role: currentRole, content });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inCodeBlock) {
      const roleMatch = line.match(ROLE_HEADER_REGEX);
      if (roleMatch) {
        const nextRole = normalizeRoleLabel(roleMatch[1]);
        if (nextRole) {
          flush();
          currentRole = nextRole;
          currentParts = [];
          const inlineContent = roleMatch[2]?.trim();
          if (inlineContent) {
            currentParts.push(inlineContent);
          }
          continue;
        }
      }
    }

    if (currentRole) {
      currentParts.push(line);
    }
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
    }
  }

  flush();

  if (messages.length < 2) {
    return { messages: [] };
  }

  const hasUser = messages.some((message) => message.role === "user");
  const hasAssistant = messages.some((message) => message.role === "assistant");
  if (!hasUser || !hasAssistant) {
    return { messages: [] };
  }

  return { messages };
}

function normalizeStandaloneRoleLine(rawLine: string): string {
  return rawLine
    .trim()
    .replace(/^[>\-\s]*/, "")
    .replace(/^(?:#{1,6}\s*)/, "")
    .replace(/\*\*/g, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function resolveStandaloneRoleLine(rawLine: string): "user" | "assistant" | null {
  const normalizedLine = normalizeStandaloneRoleLine(rawLine);
  if (!normalizedLine || normalizedLine.length > 42) {
    return null;
  }
  if (/[.?!]/.test(normalizedLine)) {
    return null;
  }

  const tokens = normalizedLine
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .split(/[ _-]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0 || tokens.length > 3) {
    return null;
  }
  if (!tokens.every((token) => STANDALONE_ROLE_LINE_ALLOWED_TOKENS.has(token))) {
    return null;
  }

  const filtered = tokens.filter((token) => token !== "said");
  const hasUserToken = filtered.some((token) => USER_LABELS.has(token));
  const hasAssistantToken = filtered.some((token) => ASSISTANT_LABELS.has(token));

  if (hasUserToken && !hasAssistantToken) return "user";
  if (hasAssistantToken && !hasUserToken) return "assistant";
  return null;
}

function parseStandaloneRoleTranscript(markdown: string): {
  messages: ParsedMessage[];
} {
  const lines = markdown.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentParts: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    if (!currentRole) return;
    const content = currentParts.join("\n").trim();
    if (!content) return;
    messages.push({ role: currentRole, content });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inCodeBlock) {
      const role = resolveStandaloneRoleLine(line);
      if (role) {
        flush();
        currentRole = role;
        currentParts = [];
        continue;
      }
    }

    if (currentRole) {
      currentParts.push(line);
    }
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
    }
  }

  flush();

  if (messages.length < 2) {
    return { messages: [] };
  }

  const hasUser = messages.some((message) => message.role === "user");
  const hasAssistant = messages.some((message) => message.role === "assistant");
  if (!hasUser || !hasAssistant) {
    return { messages: [] };
  }

  return { messages };
}

function canonicalizeSpeakerLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSpeakerLabel(label: string): string[] {
  return label
    .split(/[ _-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isLikelyColonSpeakerLabel(rawLabel: string | undefined): boolean {
  if (!rawLabel) return false;
  const normalized = canonicalizeSpeakerLabel(rawLabel);
  if (!normalized || normalized.length > 40) {
    return false;
  }

  const tokens = tokenizeSpeakerLabel(normalized);
  if (tokens.length === 0 || tokens.length > 4) {
    return false;
  }

  const hasKnownRoleToken = tokens.some(
    (token) => USER_LABELS.has(token) || ASSISTANT_LABELS.has(token),
  );
  if (
    !hasKnownRoleToken &&
    tokens.every((token) => NON_SPEAKER_LABEL_TOKENS.has(token))
  ) {
    return false;
  }
  const hasModelLikeToken = /\b(gpt|claude|gemini|perplexity|assistant|bot|ai|model|speaker)\b/i.test(
    normalized,
  );
  const hasNumericToken = tokens.some((token) => /\d/.test(token));

  if (!hasKnownRoleToken && !hasModelLikeToken && !hasNumericToken) {
    return false;
  }

  return true;
}

function extractStandaloneSpeakerLabel(rawLine: string): string | null {
  const normalizedLine = normalizeStandaloneRoleLine(rawLine);
  if (!normalizedLine || normalizedLine.length > 32) {
    return null;
  }
  if (/[.?!:]/.test(normalizedLine)) {
    return null;
  }

  const normalized = canonicalizeSpeakerLabel(normalizedLine);
  const tokens = tokenizeSpeakerLabel(normalized);
  if (tokens.length === 0 || tokens.length > 3) {
    return null;
  }
  const hasKnownRoleToken = tokens.some(
    (token) => USER_LABELS.has(token) || ASSISTANT_LABELS.has(token),
  );
  if (
    !hasKnownRoleToken &&
    tokens.every((token) => NON_SPEAKER_LABEL_TOKENS.has(token))
  ) {
    return null;
  }
  const hasModelLikeToken = /\b(gpt|claude|gemini|perplexity|assistant|bot|ai|model|speaker)\b/i.test(
    normalized,
  );
  const hasNumericToken = tokens.some((token) => /\d/.test(token));
  if (!hasKnownRoleToken && !hasModelLikeToken && !hasNumericToken) {
    return null;
  }

  return normalizedLine;
}

type SpeakerSegment = {
  labelKey: string;
  labelRaw: string;
  content: string;
};

function mapSpeakerLabelsToRoles(
  segments: SpeakerSegment[],
): Map<string, "user" | "assistant"> | null {
  if (segments.length < 2) {
    return null;
  }

  const labelKeys = Array.from(new Set(segments.map((segment) => segment.labelKey)));
  if (labelKeys.length < 2) {
    return null;
  }

  let bestPair: [string, string] | null = null;
  let bestScore = -1;
  let bestPairSegments: SpeakerSegment[] = [];

  for (let i = 0; i < labelKeys.length; i += 1) {
    for (let j = i + 1; j < labelKeys.length; j += 1) {
      const first = labelKeys[i];
      const second = labelKeys[j];
      if (!first || !second) continue;
      const pairSegments = segments.filter(
        (segment) => segment.labelKey === first || segment.labelKey === second,
      );
      if (pairSegments.length < 2) {
        continue;
      }

      const firstCount = pairSegments.filter(
        (segment) => segment.labelKey === first,
      ).length;
      const secondCount = pairSegments.filter(
        (segment) => segment.labelKey === second,
      ).length;
      if (firstCount === 0 || secondCount === 0) {
        continue;
      }

      const switches = pairSegments.reduce((count, segment, index) => {
        if (index === 0) return 0;
        const prev = pairSegments[index - 1];
        if (!prev) return count;
        return count + (segment.labelKey !== prev.labelKey ? 1 : 0);
      }, 0);

      const switchRatio = switches / Math.max(1, pairSegments.length - 1);
      if (pairSegments.length >= 4 && switchRatio < 0.25) {
        continue;
      }

      const coverage = pairSegments.length / segments.length;
      const balance = Math.min(firstCount, secondCount) / Math.max(firstCount, secondCount);
      const hints =
        (normalizeRoleLabel(first) ? 0.1 : 0) +
        (normalizeRoleLabel(second) ? 0.1 : 0);
      const score = switchRatio * 0.55 + coverage * 0.3 + balance * 0.15 + hints;

      if (score > bestScore) {
        bestScore = score;
        bestPair = [first, second];
        bestPairSegments = pairSegments;
      }
    }
  }

  if (!bestPair || bestScore < 0.35) {
    return null;
  }

  const [rawFirstLabel, rawSecondLabel] = bestPair;
  const firstIndex = segments.findIndex(
    (segment) => segment.labelKey === rawFirstLabel,
  );
  const secondIndex = segments.findIndex(
    (segment) => segment.labelKey === rawSecondLabel,
  );
  const [firstLabel, secondLabel] =
    firstIndex <= secondIndex
      ? [rawFirstLabel, rawSecondLabel]
      : [rawSecondLabel, rawFirstLabel];

  const firstHint = normalizeRoleLabel(firstLabel);
  const secondHint = normalizeRoleLabel(secondLabel);

  let userLabel: string | null = null;
  let assistantLabel: string | null = null;

  if (firstHint === "user") userLabel = firstLabel;
  if (firstHint === "assistant") assistantLabel = firstLabel;
  if (secondHint === "user") userLabel = secondLabel;
  if (secondHint === "assistant") assistantLabel = secondLabel;

  if (userLabel && !assistantLabel) {
    assistantLabel = userLabel === firstLabel ? secondLabel : firstLabel;
  }
  if (assistantLabel && !userLabel) {
    userLabel = assistantLabel === firstLabel ? secondLabel : firstLabel;
  }

  if (!userLabel || !assistantLabel) {
    const firstLengths = bestPairSegments
      .filter((segment) => segment.labelKey === firstLabel)
      .map((segment) => segment.content.length);
    const secondLengths = bestPairSegments
      .filter((segment) => segment.labelKey === secondLabel)
      .map((segment) => segment.content.length);

    const firstAverageLength =
      firstLengths.reduce((sum, value) => sum + value, 0) /
      Math.max(1, firstLengths.length);
    const secondAverageLength =
      secondLengths.reduce((sum, value) => sum + value, 0) /
      Math.max(1, secondLengths.length);
    const relativeLengthGap =
      Math.max(firstAverageLength, secondAverageLength) /
      Math.max(1, Math.min(firstAverageLength, secondAverageLength));

    if (relativeLengthGap >= 1.25) {
      assistantLabel =
        firstAverageLength >= secondAverageLength ? firstLabel : secondLabel;
      userLabel = assistantLabel === firstLabel ? secondLabel : firstLabel;
    } else {
      userLabel = firstLabel;
      assistantLabel = secondLabel;
    }
  }

  if (userLabel === assistantLabel) {
    return null;
  }

  const mapping = new Map<string, "user" | "assistant">();
  mapping.set(userLabel, "user");
  mapping.set(assistantLabel, "assistant");
  return mapping;
}

function parseGenericSpeakerTranscript(markdown: string): {
  messages: ParsedMessage[];
} {
  const lines = markdown.split(/\r?\n/);
  const segments: SpeakerSegment[] = [];

  let currentLabelRaw: string | null = null;
  let currentLabelKey: string | null = null;
  let currentParts: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    if (!currentLabelKey || !currentLabelRaw) return;
    const content = currentParts.join("\n").trim();
    if (!content) return;
    segments.push({
      labelKey: currentLabelKey,
      labelRaw: currentLabelRaw,
      content,
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inCodeBlock) {
      const roleMatch = line.match(ROLE_HEADER_REGEX);
      if (roleMatch && isLikelyColonSpeakerLabel(roleMatch[1])) {
        flush();
        currentLabelRaw = (roleMatch[1] ?? "").trim();
        currentLabelKey = canonicalizeSpeakerLabel(currentLabelRaw);
        currentParts = [];
        const inlineContent = roleMatch[2]?.trim();
        if (inlineContent) {
          currentParts.push(inlineContent);
        }
        continue;
      }

      const standaloneLabel = extractStandaloneSpeakerLabel(line);
      if (standaloneLabel) {
        flush();
        currentLabelRaw = standaloneLabel;
        currentLabelKey = canonicalizeSpeakerLabel(standaloneLabel);
        currentParts = [];
        continue;
      }
    }

    if (currentLabelKey) {
      currentParts.push(line);
    }
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
    }
  }

  flush();

  if (segments.length < 2) {
    return { messages: [] };
  }

  const mapping = mapSpeakerLabelsToRoles(segments);
  if (!mapping) {
    return { messages: [] };
  }

  const mappedMessages = segments
    .map((segment) => ({
      role: mapping.get(segment.labelKey),
      content: segment.content.trim(),
    }))
    .filter(
      (segment): segment is ParsedMessage =>
        Boolean(segment.role) && Boolean(segment.content),
    );

  const messages = mergeAdjacentSameRoleMessages(mappedMessages);
  if (messages.length < 2) {
    return { messages: [] };
  }

  const hasUser = messages.some((message) => message.role === "user");
  const hasAssistant = messages.some((message) => message.role === "assistant");
  if (!hasUser || !hasAssistant) {
    return { messages: [] };
  }

  return { messages };
}

// ============================================================================
// PARSER
// ============================================================================

export function parseNormalizedTranscript(normalizedText: string): {
  messages: ParsedMessage[];
} {
  const lines = normalizedText.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  let currentRole: "user" | "assistant" | null = null;
  let currentParts: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    if (!currentRole) return;
    const content = currentParts.join("\n").trim();
    if (!content) return;
    messages.push({ role: currentRole, content });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inCodeBlock) {
      const markerMatch = trimmed.match(/^\[(user|assistant)\]:\s*(.*)$/i);
      if (markerMatch) {
        flush();
        currentRole = (markerMatch[1] ?? "").toLowerCase() === "user" ? "user" : "assistant";
        currentParts = [];
        const inlineContent = markerMatch[2]?.trim();
        if (inlineContent) {
          currentParts.push(inlineContent);
        }
        continue;
      }
    }

    if (currentRole) {
      currentParts.push(line);
    }
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
    }
  }

  flush();

  return {
    messages: mergeAdjacentSameRoleMessages(messages),
  };
}

async function scrapeAndExtract(
  url: string,
  apiKey: string,
  reportProgress?: ImportProgressReporter,
): Promise<FirecrawlExtractionResult> {
  const startedAtMs = Date.now();
  const requestBody = {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
    waitFor: FIRECRAWL_WAIT_FOR_MS,
  };

  const scrapeStartedAtMs = Date.now();
  if (reportProgress) {
    await reportProgress(12, "Fetching shared page");
  }
  const response = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Firecrawl API error: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const scrapeCompletedAtMs = Date.now();
  const result = (await response.json()) as FirecrawlScrapeApiResponse;
  if (!result.success) {
    throw new Error(result.error || "Firecrawl scrape failed");
  }

  const markdown = result.data?.markdown || "";
  if (!markdown) {
    throw new Error("No content found on the page");
  }

  if (reportProgress) {
    await reportProgress(32, "Parsing transcript");
  }

  let { messages } = parseRoleLabeledTranscript(markdown);
  let extractionStrategy: "regex" | "normalized_markers" | "llm" = "regex";
  let normalizationDurationMs: number | undefined;
  if (messages.length > 0 && reportProgress) {
    await reportProgress(68, "Detected role labels");
  }

  if (messages.length === 0 && /\[(?:USER|ASSISTANT)\]:/i.test(markdown)) {
    messages = parseNormalizedTranscript(markdown).messages;
    extractionStrategy = "normalized_markers";
    if (messages.length > 0 && reportProgress) {
      await reportProgress(74, "Found transcript markers");
    }
  }

  if (messages.length === 0) {
    messages = parseStandaloneRoleTranscript(markdown).messages;
    if (messages.length > 0) {
      extractionStrategy = "regex";
      if (reportProgress) {
        await reportProgress(70, "Detected speaker headings");
      }
    }
  }

  if (messages.length === 0) {
    const genericMessages = parseGenericSpeakerTranscript(markdown).messages;
    if (genericMessages.length > 0) {
      messages = genericMessages;
      extractionStrategy = "regex";
      if (reportProgress) {
        await reportProgress(76, "Mapped speaker labels");
      }
    }
  }

  if (messages.length === 0) {
    const normalizationStartedAtMs = Date.now();
    if (reportProgress) {
      await reportProgress(46, "Resolving speakers with AI");
    }
    messages = await normalizeTranscriptWithLLM(markdown, async (done, total) => {
      if (!reportProgress || total <= 0) return;
      const progress = 46 + Math.round((done / total) * 36);
      await reportProgress(progress, "Resolving speakers with AI");
    });
    normalizationDurationMs = Date.now() - normalizationStartedAtMs;
    extractionStrategy = "llm";
  }

  if (messages.length === 0) {
    throw new Error(
      "Could not extract any messages from the page. The parsing might have failed.",
    );
  }

  messages = repairLikelyRoleDrift(mergeAdjacentSameRoleMessages(messages));

  if (messages.length === 0) {
    throw new Error("Could not resolve speaker roles in this transcript.");
  }

  const rawTitle = result.data?.metadata?.title;
  let finalTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
  const firstMessage = messages[0];
  if (!finalTitle && firstMessage && firstMessage.role === "user") {
    const firstLine = firstMessage.content.split("\n")[0]?.trim() ?? "";
    finalTitle = firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine;
  }
  if (!finalTitle) {
    finalTitle = "Imported Chat";
  }

  if (reportProgress) {
    await reportProgress(88, `Extracted ${messages.length} messages`);
  }

  return {
    title: finalTitle,
    messages,
    metadata: result.data?.metadata || null,
    timingsMs: {
      total: Date.now() - startedAtMs,
      firecrawl: scrapeCompletedAtMs - scrapeStartedAtMs,
      normalization: normalizationDurationMs,
    },
    extractionStrategy,
  };
}

// ============================================================================
// MAIN ACTION: SCRAPE URL
// ============================================================================

export const scrapeUrl = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error(
        "FIRECRAWL_API_KEY is not set in Convex environment variables",
      );
    }
    return scrapeAndExtract(args.url, apiKey);
  },
});

export const importIntoChat = action({
  args: {
    chatId: v.id("chats"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error(
        "FIRECRAWL_API_KEY is not set in Convex environment variables",
      );
    }

    let lastProgress = 0;
    let lastStage = "";
    const reportProgress: ImportProgressReporter = async (percent, stage) => {
      const safePercent = Math.max(1, Math.min(99, Math.round(percent)));
      const normalizedStage = stage.replace(/\s+/g, " ").trim().slice(0, 72);
      if (!normalizedStage) return;
      if (safePercent < lastProgress) return;
      if (safePercent === lastProgress && normalizedStage === lastStage) return;

      lastProgress = safePercent;
      lastStage = normalizedStage;

      await ctx.runMutation(api.chats.updateChatTitle, {
        chatId: args.chatId,
        title: `Importing ${safePercent}% · ${normalizedStage}`,
      });
    };

    try {
      await reportProgress(5, "Queued");
      let result: FirecrawlExtractionResult | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= SCRAPE_MAX_RETRIES; attempt++) {
        try {
          if (attempt > 1) {
            lastProgress = 0;
            lastStage = "";
            await reportProgress(5, `Retry ${attempt}/${SCRAPE_MAX_RETRIES}`);
            await new Promise((r) => setTimeout(r, SCRAPE_RETRY_DELAY_MS * attempt));
          }
          result = await scrapeAndExtract(args.url, apiKey, reportProgress);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const isTimeout =
            lastError.message.toLowerCase().includes("timed out") ||
            lastError.message.toLowerCase().includes("timeout");
          if (!isTimeout || attempt === SCRAPE_MAX_RETRIES) {
            throw lastError;
          }
        }
      }

      if (!result) {
        throw lastError ?? new Error("Scrape failed after retries");
      }
      const messages = (result.messages ?? []).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      if (messages.length === 0) {
        throw new Error("No messages were extracted from this link.");
      }

      await reportProgress(95, "Saving messages");
      await ctx.runMutation(api.chats.appendImportedMessagesToChat, {
        chatId: args.chatId,
        title: result.title || "Imported Chat",
        messages,
      });

      return {
        success: true,
        messageCount: messages.length,
        extractionStrategy: result.extractionStrategy,
        timingsMs: result.timingsMs ?? null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to import conversation";

      await ctx.runMutation(api.chats.appendImportFailureMessageToChat, {
        chatId: args.chatId,
        errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});
