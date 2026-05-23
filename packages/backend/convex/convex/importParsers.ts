// Pure parsers for third-party AI export formats.
// Kept side-effect free so it can run in either V8 or Node runtimes.

export type ParsedMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
};

export type ParsedConversation = {
  externalId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ParsedMessage[];
};

type ChatGptContent =
  | { content_type?: string; parts?: Array<string | { text?: string }> }
  | undefined;

type ChatGptMessageNode = {
  id?: string;
  message?: {
    id?: string;
    author?: { role?: string };
    create_time?: number | null;
    content?: ChatGptContent;
  } | null;
  parent?: string | null;
  children?: string[];
};

type ChatGptConversation = {
  id?: string;
  conversation_id?: string;
  title?: string | null;
  create_time?: number | null;
  update_time?: number | null;
  current_node?: string | null;
  mapping?: Record<string, ChatGptMessageNode>;
};

function normalizeRole(role: string | undefined): ParsedMessage["role"] | null {
  if (!role) return null;
  const lower = role.toLowerCase();
  if (lower === "user") return "user";
  if (lower === "assistant" || lower === "tool" || lower === "model") return "assistant";
  if (lower === "system") return "system";
  return null;
}

function flattenContent(content: ChatGptContent): string {
  if (!content) return "";
  const parts = content.parts ?? [];
  return parts
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function walkChatGptThread(
  conversation: ChatGptConversation,
): ParsedMessage[] {
  const mapping = conversation.mapping ?? {};
  const messages: ParsedMessage[] = [];

  // Prefer the linear path from root → current_node so we capture the
  // user-visible thread. If current_node is missing, fall back to a
  // creation-time sort of every node so we still produce something useful.
  const currentNodeId = conversation.current_node ?? null;
  const path: ChatGptMessageNode[] = [];

  if (currentNodeId && mapping[currentNodeId]) {
    let cursorId: string | null | undefined = currentNodeId;
    const visited = new Set<string>();
    while (cursorId && !visited.has(cursorId)) {
      visited.add(cursorId);
      const node: ChatGptMessageNode | undefined = mapping[cursorId];
      if (!node) break;
      path.unshift(node);
      cursorId = node.parent ?? null;
    }
  } else {
    path.push(...Object.values(mapping));
    path.sort(
      (a, b) =>
        (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0),
    );
  }

  for (const node of path) {
    const message = node.message;
    if (!message) continue;
    const role = normalizeRole(message.author?.role);
    if (!role) continue;
    const text = flattenContent(message.content);
    if (!text) continue;
    const createdAt =
      typeof message.create_time === "number" && Number.isFinite(message.create_time)
        ? Math.round(message.create_time * 1000)
        : 0;
    messages.push({ role, content: text, createdAt });
  }

  return messages;
}

export function parseChatGptExport(raw: unknown): ParsedConversation[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      "ChatGPT export is not an array. Expected the conversations.json file from a ChatGPT data export.",
    );
  }

  const conversations: ParsedConversation[] = [];

  for (const entry of raw as ChatGptConversation[]) {
    if (!entry || typeof entry !== "object") continue;
    const messages = walkChatGptThread(entry);
    if (messages.length === 0) continue;

    const earliestMessageMs = messages.reduce(
      (min, message) => (message.createdAt > 0 && message.createdAt < min ? message.createdAt : min),
      Number.MAX_SAFE_INTEGER,
    );
    const latestMessageMs = messages.reduce(
      (max, message) => (message.createdAt > max ? message.createdAt : max),
      0,
    );

    const createdAt =
      typeof entry.create_time === "number"
        ? Math.round(entry.create_time * 1000)
        : earliestMessageMs === Number.MAX_SAFE_INTEGER
          ? Date.now()
          : earliestMessageMs;
    const updatedAt =
      typeof entry.update_time === "number"
        ? Math.round(entry.update_time * 1000)
        : Math.max(createdAt, latestMessageMs);

    conversations.push({
      externalId: entry.conversation_id ?? entry.id ?? `${createdAt}-${Math.random()}`,
      title: (entry.title?.trim() || "Untitled conversation").slice(0, 200),
      createdAt,
      updatedAt,
      messages,
    });
  }

  return conversations;
}

// Sort by createdAt ascending so chunk planning sees a stable timeline.
export function sortConversationsForImport(
  conversations: ParsedConversation[],
): ParsedConversation[] {
  return [...conversations].sort((a, b) => a.createdAt - b.createdAt);
}

export type ChunkPlan = {
  chunkType: "oldest" | "newest" | "middle";
  priority: 1 | 2 | 3;
  rangeStart: number;
  rangeEnd: number; // exclusive
};

// Splits a sorted conversation list into prioritized chunks.
// Phase 1 = oldest 1–3 days + newest 1–2 weeks (priority 1 & 2).
// Phase 2 = everything in between, broken into batches (priority 3).
export function planImportChunks(
  sortedConversations: ParsedConversation[],
  options?: {
    nowMs?: number;
    oldestWindowDays?: number;
    newestWindowDays?: number;
    middleBatchSize?: number;
  },
): ChunkPlan[] {
  const total = sortedConversations.length;
  if (total === 0) return [];

  const nowMs = options?.nowMs ?? Date.now();
  const oldestWindowMs = (options?.oldestWindowDays ?? 3) * 86_400_000;
  const newestWindowMs = (options?.newestWindowDays ?? 14) * 86_400_000;
  const middleBatchSize = Math.max(10, options?.middleBatchSize ?? 25);

  const first = sortedConversations[0];
  const last = sortedConversations[total - 1];
  if (!first || !last) return [];
  const oldestAnchorMs = first.createdAt;
  const newestAnchorMs = last.updatedAt || nowMs;

  // Oldest window: conversations within `oldestWindowDays` of the first one.
  let oldestEnd = 0;
  while (oldestEnd < total) {
    const entry = sortedConversations[oldestEnd];
    if (!entry || entry.createdAt - oldestAnchorMs > oldestWindowMs) break;
    oldestEnd += 1;
  }
  // Cap oldest chunk so phase 1 stays fast even for huge histories.
  oldestEnd = Math.min(oldestEnd, Math.max(5, Math.ceil(total * 0.1)));
  oldestEnd = Math.min(oldestEnd, total);

  // Newest window: conversations within `newestWindowDays` of the last update.
  let newestStart = total;
  while (newestStart > oldestEnd) {
    const entry = sortedConversations[newestStart - 1];
    if (!entry || newestAnchorMs - entry.updatedAt > newestWindowMs) break;
    newestStart -= 1;
  }
  // Cap newest chunk size similarly.
  const newestMaxCount = Math.max(5, Math.ceil(total * 0.15));
  if (total - newestStart > newestMaxCount) {
    newestStart = total - newestMaxCount;
  }
  if (newestStart < oldestEnd) newestStart = oldestEnd;

  const chunks: ChunkPlan[] = [];

  if (oldestEnd > 0) {
    chunks.push({
      chunkType: "oldest",
      priority: 1,
      rangeStart: 0,
      rangeEnd: oldestEnd,
    });
  }

  if (newestStart < total) {
    chunks.push({
      chunkType: "newest",
      priority: 2,
      rangeStart: newestStart,
      rangeEnd: total,
    });
  }

  // Middle is whatever's between oldestEnd and newestStart — broken into batches.
  for (let start = oldestEnd; start < newestStart; start += middleBatchSize) {
    chunks.push({
      chunkType: "middle",
      priority: 3,
      rangeStart: start,
      rangeEnd: Math.min(start + middleBatchSize, newestStart),
    });
  }

  return chunks;
}
