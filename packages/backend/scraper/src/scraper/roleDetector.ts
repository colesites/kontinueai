export type Role = "user" | "assistant";
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
  | "grok";

export interface RoleResolution {
  role: Role;
  confidence: Confidence;
  method: string;
}

export interface DetectedMessage {
  node: Element;
  role: Role;
  confidence: Confidence;
  method: string;
  index: number;
}

type RoleStrategy = (node: Element, filteredIndex: number) => RoleResolution | null;

function resolve(
  strategies: Array<() => RoleResolution | null>,
  parityIndex: number
): RoleResolution | null {
  for (const fn of strategies) {
    const result = fn();
    if (result !== null) return result;
  }
  return {
    role: parityIndex % 2 === 0 ? "user" : "assistant",
    confidence: "low",
    method: "parity-fallback",
  };
}

function hasClass(el: Element, substr: string): boolean {
  for (const cls of Array.from(el.classList)) {
    if (cls.toLowerCase().includes(substr)) return true;
  }
  return false;
}

function hasClassAny(el: Element, substrs: string[]): boolean {
  return substrs.some((s) => hasClass(el, s));
}

function closestByClass(el: Element, substr: string): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (hasClass(cur, substr)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function querySelectorAny(el: Element, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const found = el.querySelector(sel);
    if (found) return found;
  }
  return null;
}

function matchesAny(el: Element, selectors: string[]): boolean {
  for (const sel of selectors) {
    try {
      if (el.matches(sel)) return true;
    } catch {
      // ignore invalid selectors
    }
  }
  return false;
}

const SKIP_SELECTORS = [
  '[class*="composer"]',
  '[class*="input"]',
  '[class*="RelatedQuestions"]',
  '[class*="FollowUpSuggestion"]',
  '[class*="sources"]',
  '[data-testid="sources"]',
  '[data-testid="share-banner"]',
  '[data-testid="system-prompt"]',
  "nav",
  "footer",
  "header",
];

function shouldSkip(node: Element): boolean {
  if (matchesAny(node, SKIP_SELECTORS)) return true;
  const role = node.getAttribute("data-message-author-role");
  if (role === "tool" || role === "system") return true;
  if (node.querySelector?.("textarea, [contenteditable]")) {
    const hasEditable = node.querySelector("textarea, [contenteditable]");
    if (hasEditable && hasEditable.parentElement === node) return true;
  }
  return false;
}

// ─── ChatGPT ───────────────────────────────────────────────

function resolveChatGPT(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const roleAttr = node.getAttribute("data-message-author-role");
      if (roleAttr === "user") return { role: "user", confidence: "high", method: "data-message-author-role" };
      if (roleAttr === "assistant") return { role: "assistant", confidence: "high", method: "data-message-author-role" };
      if (roleAttr === "tool" || roleAttr === "system") return null;
      return null;
    },
    () => {
      const testId = node.getAttribute("data-testid") ?? "";
      if (testId.includes("conversation-turn-")) {
        const match = testId.match(/conversation-turn-(\d+)/);
        if (match) {
          const turnNum = parseInt(match[1], 10);
          return {
            role: turnNum % 2 === 0 ? "user" : "assistant",
            confidence: "high",
            method: "data-testid-turn-index",
          };
        }
      }
      return null;
    },
    () => {
      if (node.querySelector('[class*="user-message"]')) {
        return { role: "user", confidence: "medium", method: "class-inspection" };
      }
      if (node.querySelector('[class*="agent-turn"]')) {
        return { role: "assistant", confidence: "medium", method: "class-inspection" };
      }
      return null;
    },
  ], filteredIndex);
}

// ─── Claude ────────────────────────────────────────────────

function resolveClaude(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const testId = node.getAttribute("data-testid");
      if (testId === "human-turn") return { role: "user", confidence: "high", method: "data-testid" };
      if (testId === "assistant-turn") return { role: "assistant", confidence: "high", method: "data-testid" };
      return null;
    },
    () => {
      if (node.closest('[data-testid="human-turn"]')) return { role: "user", confidence: "high", method: "closest-data-testid" };
      if (node.closest('[data-testid="assistant-turn"]')) return { role: "assistant", confidence: "high", method: "closest-data-testid" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["human"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["assistant"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      const img = node.querySelector("img");
      if (img) {
        const alt = (img.getAttribute("alt") ?? "").toLowerCase();
        if (alt.includes("claude")) return { role: "assistant", confidence: "medium", method: "avatar-inspection" };
        if (alt.includes("human")) return { role: "user", confidence: "medium", method: "avatar-inspection" };
      }
      if (node.querySelector('[class*="human-avatar"]')) return { role: "user", confidence: "medium", method: "avatar-inspection" };
      return null;
    },
  ], filteredIndex);
}

// ─── Gemini ────────────────────────────────────────────────

function resolveGemini(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const tag = node.tagName.toLowerCase();
      if (tag === "user-query") return { role: "user", confidence: "high", method: "tag-name" };
      if (tag === "model-response") return { role: "assistant", confidence: "high", method: "tag-name" };
      return null;
    },
    () => {
      if (node.closest("user-query")) return { role: "user", confidence: "high", method: "closest-tag" };
      if (node.closest("model-response")) return { role: "assistant", confidence: "high", method: "closest-tag" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["user-query-container"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["response-container", "model-response"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
  ], filteredIndex);
}

// ─── Perplexity ────────────────────────────────────────────

function resolvePerplexity(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const testId = node.getAttribute("data-testid");
      if (testId === "user-message") return { role: "user", confidence: "high", method: "data-testid" };
      if (testId === "answer") return { role: "assistant", confidence: "high", method: "data-testid" };
      return null;
    },
    () => {
      if (node.closest('[data-testid="user-message"]')) return { role: "user", confidence: "high", method: "closest-data-testid" };
      if (node.closest('[data-testid="answer"]')) return { role: "assistant", confidence: "high", method: "closest-data-testid" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["UserMessage"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["AnswerBody", "prose"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      if (node.querySelector("[data-citation]")) return { role: "assistant", confidence: "medium", method: "citation-detection" };
      return null;
    },
  ], filteredIndex);
}

// ─── T3 Chat ───────────────────────────────────────────────

function resolveT3Chat(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const roleAttr = node.getAttribute("data-role");
      if (roleAttr === "user") return { role: "user", confidence: "high", method: "data-role" };
      if (roleAttr === "assistant") return { role: "assistant", confidence: "high", method: "data-role" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["user-bubble", "human"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["assistant-bubble", "ai-"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      const style = window.getComputedStyle(node);
      const jc = style.justifyContent;
      const as = style.alignSelf;
      const ta = style.textAlign;
      if (jc === "flex-end" || as === "flex-end" || ta === "right") {
        return { role: "user", confidence: "low", method: "layout-alignment" };
      }
      if (jc === "flex-start" || as === "flex-start") {
        return { role: "assistant", confidence: "low", method: "layout-alignment" };
      }
      return null;
    },
  ], filteredIndex);
}

// ─── DeepSeek ──────────────────────────────────────────────

function resolveDeepSeek(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const roleAttr = node.getAttribute("data-role");
      if (roleAttr === "user") return { role: "user", confidence: "high", method: "data-role" };
      if (roleAttr === "assistant") return { role: "assistant", confidence: "high", method: "data-role" };
      return null;
    },
    () => {
      const aria = (node.getAttribute("aria-label") ?? "").toLowerCase();
      if (aria.includes("you") || aria.includes("user")) return { role: "user", confidence: "high", method: "aria-label" };
      if (aria.includes("deepseek") || aria.includes("ai") || aria.includes("assistant")) return { role: "assistant", confidence: "high", method: "aria-label" };
      return null;
    },
    () => {
      const imgs = node.querySelectorAll("img");
      for (const img of Array.from(imgs)) {
        const src = (img.getAttribute("src") ?? "").toLowerCase();
        const alt = (img.getAttribute("alt") ?? "").toLowerCase();
        if (src.includes("user") || alt.includes("user")) return { role: "user", confidence: "medium", method: "avatar-inspection" };
        if (src.includes("deepseek") || alt.includes("ai")) return { role: "assistant", confidence: "medium", method: "avatar-inspection" };
      }
      return null;
    },
    () => {
      if (node.querySelector('[class*="think"]')) return { role: "assistant", confidence: "medium", method: "thinking-block" };
      return null;
    },
  ], filteredIndex);
}

// ─── Copilot ───────────────────────────────────────────────

function resolveCopilot(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const testId = node.getAttribute("data-testid");
      if (testId === "user-message") return { role: "user", confidence: "high", method: "data-testid" };
      if (testId === "ai-message") return { role: "assistant", confidence: "high", method: "data-testid" };
      return null;
    },
    () => {
      if (node.tagName.toLowerCase() === "cib-message") {
        const type = node.getAttribute("type");
        if (type === "user") return { role: "user", confidence: "high", method: "custom-element-type" };
        if (type === "bot") return { role: "assistant", confidence: "high", method: "custom-element-type" };
      }
      return null;
    },
    () => {
      if (hasClassAny(node, ["user"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["bot", "copilot"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      const avatar = node.querySelector("img, [aria-label]");
      if (avatar) {
        const alt = (avatar.getAttribute("alt") ?? "").toLowerCase();
        const aria = (avatar.getAttribute("aria-label") ?? "").toLowerCase();
        const label = alt || aria;
        if (label.includes("user")) return { role: "user", confidence: "medium", method: "avatar-inspection" };
        if (label.includes("copilot")) return { role: "assistant", confidence: "medium", method: "avatar-inspection" };
      }
      return null;
    },
  ], filteredIndex);
}

// ─── Qwen ──────────────────────────────────────────────────

function resolveQwen(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const roleAttr = node.getAttribute("data-role");
      if (roleAttr === "user") return { role: "user", confidence: "high", method: "data-role" };
      if (roleAttr === "assistant") return { role: "assistant", confidence: "high", method: "data-role" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["user-message", "human-message"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["assistant-message", "robot-message", "ai-message"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      const dir = node.getAttribute("data-direction");
      if (dir === "right") return { role: "user", confidence: "medium", method: "data-direction" };
      if (dir === "left") return { role: "assistant", confidence: "medium", method: "data-direction" };
      return null;
    },
  ], filteredIndex);
}

// ─── Manus ─────────────────────────────────────────────────

function resolveManus(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const type = node.getAttribute("data-type");
      if (type === "task" || type === "input" || type === "request") return { role: "user", confidence: "high", method: "data-type" };
      if (type === "step" || type === "action" || type === "response" || type === "result") return { role: "assistant", confidence: "high", method: "data-type" };
      return null;
    },
    () => {
      const roleAttr = node.getAttribute("data-role");
      if (roleAttr === "user") return { role: "user", confidence: "high", method: "data-role" };
      if (roleAttr === "agent") return { role: "assistant", confidence: "high", method: "data-role" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["user-request", "task-input"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["agent-step", "agent-action"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      return {
        role: filteredIndex === 0 ? "user" : "assistant",
        confidence: "low",
        method: "manus-first-is-user",
      };
    },
  ], filteredIndex);
}

// ─── Grok ──────────────────────────────────────────────────

function resolveGrok(node: Element, filteredIndex: number): RoleResolution | null {
  if (shouldSkip(node)) return null;

  return resolve([
    () => {
      const testId = node.getAttribute("data-testid");
      if (testId === "userMessage") return { role: "user", confidence: "high", method: "data-testid" };
      if (testId === "grokMessage") return { role: "assistant", confidence: "high", method: "data-testid" };
      return null;
    },
    () => {
      if (node.closest('[data-testid="userMessage"]')) return { role: "user", confidence: "high", method: "closest-data-testid" };
      if (node.closest('[data-testid="grokMessage"]')) return { role: "assistant", confidence: "high", method: "closest-data-testid" };
      return null;
    },
    () => {
      if (hasClassAny(node, ["UserMessage"])) return { role: "user", confidence: "medium", method: "class-inspection" };
      if (hasClassAny(node, ["GrokMessage", "AssistantMessage"])) return { role: "assistant", confidence: "medium", method: "class-inspection" };
      return null;
    },
    () => {
      const labeled = node.querySelector("[aria-label], img[alt]");
      if (labeled) {
        const aria = (labeled.getAttribute("aria-label") ?? "").toLowerCase();
        const alt = (labeled.getAttribute("alt") ?? "").toLowerCase();
        const label = aria || alt;
        if (label.includes("you")) return { role: "user", confidence: "medium", method: "avatar-inspection" };
        if (label.includes("grok")) return { role: "assistant", confidence: "medium", method: "avatar-inspection" };
      }
      return null;
    },
  ], filteredIndex);
}

// ─── Strategy map ──────────────────────────────────────────

const STRATEGIES: Record<Platform, RoleStrategy> = {
  chatgpt: resolveChatGPT,
  claude: resolveClaude,
  gemini: resolveGemini,
  perplexity: resolvePerplexity,
  t3chat: resolveT3Chat,
  deepseek: resolveDeepSeek,
  copilot: resolveCopilot,
  qwen: resolveQwen,
  manus: resolveManus,
  grok: resolveGrok,
};

// ─── Public API ────────────────────────────────────────────

export function resolveRoles(
  nodes: Element[],
  platform: Platform
): DetectedMessage[] {
  const strategy = STRATEGIES[platform];
  const results: DetectedMessage[] = [];
  let filteredIndex = 0;

  for (const node of nodes) {
    const resolution = strategy(node, filteredIndex);
    if (resolution !== null) {
      results.push({
        node,
        role: resolution.role,
        confidence: resolution.confidence,
        method: resolution.method,
        index: results.length,
      });
      filteredIndex++;
    }
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const lowConf = results.filter((r) => r.confidence === "low");
    if (lowConf.length > 0) {
      console.warn(
        `[roleDetector] ${lowConf.length} node(s) resolved with low confidence on platform "${platform}". Methods:`,
        lowConf.map((r) => r.method)
      );
    }
  }

  return results;
}
