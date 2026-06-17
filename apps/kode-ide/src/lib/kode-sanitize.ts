// Some open models (notably the free Gemma that powers Kode 1.0) don't always
// emit native structured tool calls — they spit the call out as raw text using
// their chat-template special tokens, e.g.
//   <|tool_call>call:ask_options{options:...<|"|>minimalism<|"|>...}
// That text both leaks into the chat bubble and means the tool never actually
// runs. We can't recover the (often malformed) call, but we can keep the raw
// control-token soup out of the visible/persisted message.

// Markers that indicate the model has started emitting a text tool-call block.
// Everything from here on is machine syntax, not prose — drop it.
const TOOL_CALL_START =
  /<\|tool_call|<\|tool|<\|call|<\|function|\bcall:(?:ask_options|update_todos|kode_[a-z_]+)\b/i;

/** Index of the first text tool-call marker, or -1 if there is none. */
export function findToolCallStart(text: string): number {
  const match = text.match(TOOL_CALL_START);
  return match && match.index !== undefined ? match.index : -1;
}

/** Remove stray `<|...|>` / `<|"|>` special tokens from a chunk of prose. */
export function stripControlTokens(text: string): string {
  return text.replace(/<\|[^|>]*\|?>/g, "");
}

/** Full clean-up for a finished message: cut any tool-call block, then strip
 *  leftover control tokens. */
export function stripKodeArtifacts(text: string): string {
  if (!text) return text;
  let out = text;
  const start = findToolCallStart(out);
  if (start !== -1) out = out.slice(0, start);
  return stripControlTokens(out).trimEnd();
}

/**
 * Stateful filter for the streaming path. Forwards clean prose to `emit`,
 * holds back a short tail so a half-arrived `<|tool…` marker is never shown,
 * and once a tool-call block starts, suppresses everything after it.
 */
export function createContentFilter(emit: (text: string) => void) {
  let raw = "";
  let emitted = 0;
  let suppressed = false;
  // Long enough to buffer a forming marker like "<|tool_call|>".
  const HOLDBACK = 16;

  const emitUpTo = (clean: string, upto: number) => {
    if (upto > emitted) {
      emit(clean.slice(emitted, upto));
      emitted = upto;
    }
  };

  return {
    push(delta: string) {
      if (suppressed) return;
      raw += delta;
      const start = findToolCallStart(raw);
      if (start !== -1) {
        const prefix = stripControlTokens(raw.slice(0, start));
        emitUpTo(prefix, prefix.length);
        suppressed = true;
        return;
      }
      const clean = stripControlTokens(raw);
      emitUpTo(clean, Math.max(emitted, clean.length - HOLDBACK));
    },
    flush() {
      if (suppressed) return;
      const clean = stripControlTokens(raw);
      emitUpTo(clean, clean.length);
    },
  };
}
