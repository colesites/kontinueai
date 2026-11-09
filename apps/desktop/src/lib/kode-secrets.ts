// Spotting secrets in text that is about to leave the device or reach another
// model (hand-offs, imports). Mirrors the Rust patterns in kode_import.rs and
// adds a few common shapes (JWTs, Stripe keys, bearer tokens, KEY=value lines).

export type SecretMatch = { start: number; end: number; kind: string; preview: string };

const PATTERNS: [string, RegExp][] = [
  ["API key", /sk-(?:ant-|proj-|live-)?[A-Za-z0-9_-]{16,}/g],
  ["Stripe key", /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g],
  ["GitHub token", /github_pat_[A-Za-z0-9_]{20,}/g],
  ["Slack token", /xox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Google key", /AIza[0-9A-Za-z_-]{35}/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["Bearer token", /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
];

// `token = …` / `API_KEY=…`: only when the value looks like a secret, not code
// such as `token: ask.host` (kept in step with looks_like_secret in Rust).
const KEY_VALUE = /((?:api[_-]?key|secret|token|password|passwd|authorization|[A-Z0-9_]*_(?:KEY|SECRET|TOKEN|PASSWORD))\s*[:=]\s*['"]?)([A-Za-z0-9_\-./+=]{8,})/gi;

export function looksLikeSecret(value: string): boolean {
  if (value.split(".").every((part) => /^[A-Za-z_]+$/.test(part))) return false;
  const hasDigit = /\d/.test(value);
  const hasLetter = /[A-Za-z]/.test(value);
  return (hasDigit && hasLetter && value.length >= 10) || value.length >= 24;
}

export const SECRET_MARK = "[REDACTED_SECRET]";

/** Every secret-looking span, non-overlapping, in order. */
export function scanSecrets(text: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  for (const [kind, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (match[0].includes(SECRET_MARK)) continue;
      if (found.some((m) => start < m.end && end > m.start)) continue;
      const value = match[0];
      found.push({ start, end, kind, preview: `${value.slice(0, 6)}…${value.length > 14 ? value.slice(-3) : ""}` });
    }
  }
  KEY_VALUE.lastIndex = 0;
  for (const match of text.matchAll(KEY_VALUE)) {
    if (!looksLikeSecret(match[2])) continue;
    const start = (match.index ?? 0) + match[1].length;
    const end = start + match[2].length;
    if (found.some((m) => start < m.end && end > m.start)) continue;
    found.push({ start, end, kind: "Secret value", preview: `${match[2].slice(0, 6)}…` });
  }
  return found.sort((a, b) => a.start - b.start);
}

export function redactSecrets(text: string): { text: string; count: number } {
  const matches = scanSecrets(text);
  if (matches.length === 0) return { text, count: 0 };
  let out = "";
  let last = 0;
  for (const match of matches) {
    out += text.slice(last, match.start) + SECRET_MARK;
    last = match.end;
  }
  return { text: out + text.slice(last), count: matches.length };
}

/** Remove secrets from every message of a history; returns how many went. */
export function scrubHistory<T extends { content: string }>(history: T[]): { history: T[]; count: number } {
  let count = 0;
  const out = history.map((message) => {
    const result = redactSecrets(message.content);
    count += result.count;
    return result.count ? { ...message, content: result.text } : message;
  });
  return { history: out, count };
}
