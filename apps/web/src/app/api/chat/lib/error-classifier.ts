// Turns an arbitrary thrown error (AI Gateway / provider / runtime) into a
// stable, user-safe message. The client (getChatErrorToast) pattern-matches the
// returned string to render a friendly toast. We deliberately DO NOT leak
// internal details like "out of credits" — billing problems are the operator's,
// not the end user's, so they surface as a generic "temporarily unavailable".

export type ChatErrorCode =
  | "ai_unavailable" // billing/credits/provider outage — show generic
  | "model_unavailable" // model restricted on current plan/gateway tier — switch
  | "rate_limited" // 429 — slow down
  | "message_limit" // per-user usage cap reached
  | "unauthorized" // 401/403
  | "input_too_long" // context window exceeded
  | "timeout" // network/timeout
  | "server_error"; // anything else

// Stable sentences the client matches on. Keep in sync with getChatErrorToast.
const MESSAGES: Record<ChatErrorCode, string> = {
  ai_unavailable:
    "The AI service is temporarily unavailable. Please try again in a little while.",
  model_unavailable:
    "This model isn't available right now. Please switch to a different model and try again.",
  rate_limited:
    "This model is busy right now (rate limited). Wait a few seconds and try again, or switch to a different model.",
  message_limit:
    "You've reached your message limit. Upgrade your plan or try again later.",
  unauthorized: "You're not signed in. Please refresh and sign in again.",
  input_too_long:
    "Your message is too long for this model. Shorten it and try again.",
  timeout: "The AI took too long to respond. Please try again.",
  server_error: "Something went wrong on our end. Please try again.",
};

// Stable machine codes from the AI Gateway / provider envelope. These are the
// real signals (`error.type`, `error.name`, `error.code`) — we classify on
// these FIRST and only fall back to regex on free text when they're absent.
const CODE_TO_ERROR: Record<string, ChatErrorCode> = {
  // billing / credits — operator problem, surface as generic unavailable
  insufficient_quota: "ai_unavailable",
  insufficient_credits: "ai_unavailable",
  payment_required: "ai_unavailable",
  billing_error: "ai_unavailable",
  // model restricted on current plan/gateway tier — user should switch model
  no_providers_available: "model_unavailable",
  restrictedmodelserror: "model_unavailable",
  model_not_found: "model_unavailable",
  model_not_available: "model_unavailable",
  unsupported_model: "model_unavailable",
  // rate limiting
  rate_limit_exceeded: "rate_limited",
  rate_limited: "rate_limited",
  too_many_requests: "rate_limited",
  // auth
  authentication_error: "unauthorized",
  invalid_api_key: "unauthorized",
  unauthorized: "unauthorized",
  forbidden: "unauthorized",
  // context window
  context_length_exceeded: "input_too_long",
  // network/timeout
  timeout: "timeout",
  etimedout: "timeout",
  econnreset: "timeout",
};

function dig(error: unknown): {
  status: number | null;
  text: string;
  codes: string[];
} {
  let status: number | null = null;
  const parts: string[] = [];
  const codes: string[] = [];
  const seen = new Set<unknown>();

  const visit = (val: unknown, depth: number) => {
    if (val == null || depth > 6) return;
    if (typeof val === "string") {
      parts.push(val);
      return;
    }
    if (typeof val === "number") {
      parts.push(String(val));
      return;
    }
    if (typeof val !== "object") return;
    if (seen.has(val)) return;
    seen.add(val);

    if (Array.isArray(val)) {
      for (const item of val) visit(item, depth + 1);
      return;
    }

    const obj = val as Record<string, unknown>;
    // Capture the first status code we encounter at any depth.
    for (const key of ["statusCode", "status", "responseStatus"]) {
      const n = obj[key];
      if (typeof n === "number" && status == null) status = n;
    }
    // Pull text from signal-bearing fields (works even when non-enumerable,
    // e.g. Error.message/name, since we read them by explicit key).
    for (const key of ["message", "name", "type", "code", "responseBody"]) {
      const s = obj[key];
      if (typeof s === "string") parts.push(s);
    }
    // Capture the STRUCTURED machine codes separately — these are exact, not
    // guessed. `type`/`name`/`code` carry stable identifiers like
    // "no_providers_available" or "rate_limit_exceeded".
    for (const key of ["type", "name", "code"]) {
      const s = obj[key];
      if (typeof s === "string") codes.push(s.toLowerCase());
    }
    // Recurse into the many places the AI SDK nests the underlying cause.
    for (const key of [
      "error",
      "cause",
      "data",
      "body",
      "errors",
      "lastError",
      "responses",
      "value",
    ]) {
      if (key in obj) visit(obj[key], depth + 1);
    }
  };

  visit(error, 0);
  return { status, text: parts.join(" ").toLowerCase(), codes };
}

export function classifyChatErrorCode(error: unknown): ChatErrorCode {
  const { status, text, codes } = dig(error);

  // 1. Exact structured codes first — this is "getting the real error" rather
  // than guessing. e.g. type:"no_providers_available" → model_unavailable.
  for (const code of codes) {
    const mapped = CODE_TO_ERROR[code];
    if (mapped) return mapped;
  }

  // 2. Fall back to status + free-text heuristics only when no known code.
  if (
    status === 402 ||
    /insufficient|out of (credit|fund)|no (credit|balance)|quota (exceeded|exhausted)|payment required|billing|spend limit|hard limit reached/.test(
      text,
    )
  ) {
    return "ai_unavailable";
  }
  if (
    /message limit|usage limit|daily limit|monthly limit|plan limit reached/.test(
      text,
    )
  ) {
    return "message_limit";
  }
  // Model-access restriction (e.g. Vercel AI Gateway free tier returns a 403
  // "RestrictedModelsError"/"no_providers_available" for premium-only models).
  // This is NOT an auth failure — must be caught BEFORE the 401/403 branch,
  // otherwise it gets mislabeled as "unauthorized" / "not signed in".
  if (
    /no_providers_available|restrictedmodels|do not have access to this model|access to this model|not available on (the|your) (free|current) (tier|plan)|paid credits/.test(
      text,
    )
  ) {
    return "model_unavailable";
  }
  if (status === 429 || /rate.?limit|too many requests|slow down/.test(text)) {
    return "rate_limited";
  }
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|forbidden|invalid api key|not authenticated|authentication/.test(
      text,
    )
  ) {
    return "unauthorized";
  }
  if (
    /context length|maximum context|context window|input.{0,12}too long|too many tokens|max input tokens/.test(
      text,
    )
  ) {
    return "input_too_long";
  }
  if (/timeout|timed out|etimedout|econnreset|network|fetch failed|aborted/.test(text)) {
    return "timeout";
  }
  return "server_error";
}

export function classifyChatError(error: unknown): string {
  return MESSAGES[classifyChatErrorCode(error)];
}
