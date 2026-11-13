// Turns a thrown error into a short title and one readable line for error
// screens, keeping the full text for "Copy details".

/** "[CONVEX Q(kode:getRecentMessages)] [Request ID: …] Server Error" → readable parts. */
export function describeError(error: unknown): { title: string; detail: string; full: string } {
  const message = error instanceof Error ? error.message : String(error);
  const full = error instanceof Error && error.stack ? `${message}\n\n${error.stack}` : message;
  const convex = message.match(/^\[CONVEX [QMA]\(([^)]+)\)\](?: \[Request ID: ([^\]]+)\])?\s*([\s\S]*)$/);
  if (convex) {
    const [, fn, requestId, rest] = convex;
    const reason = rest.replace(/\s*Called by client\s*$/, "").trim();
    return {
      title: "Couldn't load this from the server",
      detail: `${fn}${reason && reason !== "Server Error" ? `: ${reason}` : ""}${requestId ? ` (request ${requestId})` : ""}`,
      full,
    };
  }
  return { title: "Something went wrong here", detail: message, full };
}
