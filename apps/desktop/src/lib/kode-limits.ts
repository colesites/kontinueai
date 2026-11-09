// Spotting "you hit a usage limit" in a failed turn, and when it resets.
//
// Sources, most exact first:
// - Kode's own models: the Kontinue server sends `resetAt`; Rust keeps it as a
//   `[[limit-reset:<ms>]]` marker on the error text (see `kode_chat`).
// - Claude Code: Rust reads `rate_limit_event` and returns `limitResetsAt`.
// - Everything else: the CLI's error text ("try again in 2 hours", "resets 3pm").

export type LimitHit = {
  /** Epoch ms when the limit resets, or null when the text didn't say. */
  resetAt: number | null;
  /** The error text with any internal marker removed. */
  message: string;
};

const MARKER = /\s*\[\[limit-reset:(\d+)\]\]/;

const LIMIT_WORDS =
  /usage limit|rate[ -]?limit|limit reached|reached your (?:usage |message )?limit|hit (?:your|the) (?:usage |message |weekly |daily )?limit|out of (?:extra )?usage|quota|too many requests|\b429\b|limit (?:will )?resets?|session limit|weekly limit|5-hour limit/i;

/** Strip the internal marker from an error message for display. */
export function cleanLimitMarker(text: string): string {
  return text.replace(MARKER, "").trim();
}

/** Returns a LimitHit when `text` reads like a usage/rate limit, else null. */
export function detectLimit(
  text: string,
  options: { resetAt?: number | null; now?: number } = {},
): LimitHit | null {
  const now = options.now ?? Date.now();
  const marker = text.match(MARKER);
  const message = cleanLimitMarker(text);
  if (marker) return { resetAt: Number(marker[1]), message };
  if (options.resetAt) return { resetAt: options.resetAt, message };
  if (!LIMIT_WORDS.test(message)) return null;
  return { resetAt: parseResetTime(message, now), message };
}

/** Best-effort reset time from a limit message; null when there isn't one. */
export function parseResetTime(text: string, now = Date.now()): number | null {
  // Claude Code's older format: "Claude AI usage limit reached|1749924000".
  const epoch = text.match(/\|(\d{10,13})\b/);
  if (epoch) {
    const n = Number(epoch[1]);
    return n < 1e12 ? n * 1000 : n;
  }

  // Relative: "try again in 2 hours 13 minutes", "in 45m", "in 3 days".
  const relative = text.match(
    /\bin\s+((?:\d+(?:\.\d+)?\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b[\s,and]*)+)/i,
  );
  if (relative) {
    let ms = 0;
    for (const part of relative[1].matchAll(
      /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi,
    )) {
      const value = Number(part[1]);
      const unit = part[2].toLowerCase();
      if (unit.startsWith("d")) ms += value * 86_400_000;
      else if (unit.startsWith("h")) ms += value * 3_600_000;
      else if (unit.startsWith("m")) ms += value * 60_000;
      else ms += value * 1000;
    }
    if (ms > 0) return now + ms;
  }

  // Absolute date: "try again at Nov 9th, 2026 3:05 PM".
  const dated = text.match(
    /\b([A-Z][a-z]{2,8}\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4},? \d{1,2}:\d{2}\s?[AP]M)/i,
  );
  if (dated) {
    const parsed = Date.parse(
      dated[1].replace(/(\d)(st|nd|rd|th)/i, "$1").replace(/,/g, ""),
    );
    if (!Number.isNaN(parsed)) return parsed;
  }

  // ISO timestamp anywhere in the text.
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/);
  if (iso) {
    const parsed = Date.parse(iso[0]);
    if (!Number.isNaN(parsed)) return parsed;
  }

  // Time of day: "resets 3pm", "resets at 3:05 PM", "try again at 15:30".
  const clock = text.match(
    /\b(?:resets?|reset at|try again at|available (?:again )?at|until)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (clock) {
    let hours = Number(clock[1]);
    const minutes = clock[2] ? Number(clock[2]) : 0;
    const meridiem = clock[3]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59 || (!meridiem && !clock[2])) return null;
    const at = new Date(now);
    at.setHours(hours, minutes, 0, 0);
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    return at.getTime();
  }

  return null;
}

/** "3:05 PM", or "Tue 3:05 PM" when it isn't today. */
export function formatResetTime(at: number, now = Date.now()): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(now).toDateString() === date.toDateString();
  return sameDay ? time : `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/** "in 2h 13m", "in 45m", "in under a minute". */
export function formatCountdown(at: number, now = Date.now()): string {
  const ms = at - now;
  if (ms <= 60_000) return "in under a minute";
  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return minutes ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
  return `in ${minutes}m`;
}
