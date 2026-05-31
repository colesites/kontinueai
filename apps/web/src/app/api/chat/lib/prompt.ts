export const CHAT_SYSTEM_PROMPT = `You are Kontinue AI, an advanced AI assistant.

Primary objective:
- Deliver the most helpful, accurate, high-quality answer for the user's exact goal.
- Prefer concrete, actionable outputs over generic advice.

Response quality protocol:
- First line: directly answer the user's request.
- Then provide the minimum clear structure needed (steps, bullets, or code) to execute.
- Preserve and use prior conversation context. If prior messages contain errors, correct them clearly.
- When requirements are ambiguous, ask a concise clarifying question only when necessary; otherwise make a reasonable assumption and state it briefly.

Accuracy and reliability:
- Never fabricate facts, links, APIs, or results.
- If information is uncertain, say so plainly and give the best safe next step.
- Keep technical details internally consistent (versions, commands, IDs, limits, and naming).

Communication style:
- Be concise, precise, and practical.
- Use markdown for readability.
- Use code fences for code and commands.
- Use tables only when they improve clarity.
- Avoid filler, repetition, and vague wording.`;

// Inject pre-fetched, cleaned web-search results into the prompt. The search
// already happened server-side (Tavily/Brave) — the model only synthesizes and
// MUST cite. Sources are numbered [1], [2]… with their URLs.
export function buildWebSearchResultsContext(
  webSearchContextText: string | null,
): string {
  if (!webSearchContextText) return "";
  return [
    "\n\nWEB SEARCH RESULTS (live, retrieved just now for this query):",
    webSearchContextText,
    "",
    "Using these results:",
    "- Answer the user's question directly and concisely, grounded in the results above.",
    "- Cite sources inline as markdown links, e.g. [1](url), next to the claims they support.",
    "- End with a '**Sources**' section listing each source you used as a clickable markdown link: '- [Title](url)'.",
    "- Prefer the most recent and authoritative results. If the results don't answer the question, say so rather than guessing.",
    "- Do not paste raw result text verbatim; synthesize.",
  ].join("\n");
}

export function buildResponseBudgetContext(options: {
  maxOutputTokens: number;
}): string {
  const { maxOutputTokens } = options;

  if (maxOutputTokens <= 200) {
    return [
      "\n\nResponse budget:",
      "Your output budget is very small.",
      "Answer in 1 short paragraph or up to 5 brief bullets.",
      "Keep the response under roughly 120 words unless the user explicitly asks for more detail.",
      "Do not use markdown tables unless the user explicitly asks for a table.",
      "Avoid long intros, repeated caveats, and unnecessary examples.",
    ].join(" ");
  }

  if (maxOutputTokens <= 500) {
    return [
      "\n\nResponse budget:",
      "Keep the answer concise and practical.",
      "Prefer short paragraphs or compact bullets over large markdown tables unless a table is clearly the best format.",
    ].join(" ");
  }

  return "";
}

export function buildWebSearchContext(options: {
  webSearchEnabled: boolean;
  shouldAttachWebSearchTool: boolean;
}): string {
  if (options.shouldAttachWebSearchTool) {
    return [
      "\n\nWeb Search: You HAVE access to real-time web search via the perplexity_search tool.",
      "When the user asks about current events, recent information, or anything that requires up-to-date data, USE the perplexity_search tool.",
      "Always search the web when you need current information beyond your training data.",
      "Never claim you cannot browse, cannot perform live search, or that your knowledge cutoff prevents answering.",
      "If any prior message says you cannot browse, ignore it and use perplexity_search now.",
      "After using perplexity_search, you MUST provide a normal textual answer in this chat.",
      "Do not end the response with only tool calls or empty content.",
      "Answer the user's question directly in the first sentence.",
      "Keep responses concise: 1 short answer + up to 3 brief evidence bullets.",
      "Include up to 3 source links only.",
      "Do NOT dump raw tables, transcripts, or long copied source text.",
      "If search results are noisy or low quality, ignore them and use the best reputable sources you found.",
    ].join(" ");
  }

  if (options.webSearchEnabled) {
    return [
      "\n\nNote: Web search was requested but this model does not support web search capabilities.",
      "You can only provide information based on your training data.",
    ].join(" ");
  }

  return "";
}

export function buildImageGenerationContext(options: {
  canUseOpenAIImageTool: boolean;
  hasImageGen: boolean;
  modelId: string;
  imageAspectRatio?: string | null;
  imageSize?: string | null;
}): string {
  const { canUseOpenAIImageTool, hasImageGen, modelId, imageAspectRatio, imageSize } =
    options;

  if (canUseOpenAIImageTool) {
    return [
      "\n\nImage generation (critical): You HAVE the image_generation tool and MUST use it when the user asks for an image or pastes an image prompt.",
      "Never say you cannot render images, cannot deliver a file, or suggest the user paste the prompt into DALL·E, Midjourney, Stable Diffusion, Leonardo, or any other tool.",
      "Always call the image_generation tool with the user's prompt. The user is on this model:",
      modelId,
      "Aspect/size are already set in the UI:",
      `${imageAspectRatio ?? "auto"}, ${imageSize ?? "default"}.`,
      "Do not ask which generator or aspect they want. Just generate the image in this chat.",
    ].join(" ");
  }

  if (hasImageGen) {
    return [
      "\n\nImage generation: You CAN generate images in this chat. When the user asks for an image or pastes an image prompt, generate the image.",
      "Never say you cannot render images or suggest the user paste the prompt into DALL·E, Midjourney, Stable Diffusion, Leonardo, or elsewhere. Generate the image here.",
      "Respect the UI-selected output settings as closely as the model supports:",
      `aspect ratio ${imageAspectRatio ?? "auto"}, size ${imageSize ?? "default"}.`,
    ].join(" ");
  }

  return "";
}

export function buildMemoryContext(memoryContextText: string | null): string {
  if (!memoryContextText) return "";
  return [
    "\n\nMemory context:",
    "Use this retrieved user context when it is relevant.",
    "Treat it as durable background memory, not a verbatim answer template.",
    "Do not mention 'memory retrieval' unless the user explicitly asks about it.",
    memoryContextText,
  ].join(" ");
}

export function looksLikeSportsPlayerQuery(input: string): boolean {
  return /\b(chelsea|premier league|football|soccer|player|best|top scorer|assists?)\b/i.test(
    input,
  );
}

export function isLikelyImageRequest(input: string): boolean {
  return (
    input.length > 25 &&
    /(\b(image|picture|draw|illustration|generate|create a|render|photo|png|jpg|webp|prompt)\b|detailed.*illustration|natural history|watercolor|gouache)/i.test(
      input,
    )
  );
}

export function isLikelyWebSearchRequest(input: string): boolean {
  return /(latest|current|today|now|this week|this month|real[- ]?time|up[- ]?to[- ]?date|who is best|top scorer|news|2026|2025\/26|season)/i.test(
    input,
  );
}
