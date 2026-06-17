---
name: debugging
description: Use when diagnosing a bug, error, crash, or unexpected behavior before proposing a fix.
appliesTo: []
version: "1.0"
---

# Debugging

## When to use
The user reports an error, crash, failing test, or "it doesn't work."

## Procedure
1. **Reproduce / read the actual error.** Get the full message, stack trace, and
   the exact command. Never guess from a paraphrase if the real output is available.
2. **Localize.** Map the stack trace to a file and line. Read that code and its
   immediate callers before theorizing.
3. **Form one hypothesis at a time** and confirm it with evidence (log, test,
   minimal repro) before changing code.
4. **Fix the root cause**, not the symptom. Then verify by re-running the repro.
5. **Check for siblings** — the same bug pattern often exists elsewhere.

## Rules
- Quote the real error in your explanation; don't invent plausible-sounding ones.
- Change the smallest amount of code that fixes the cause.
- Add or update a test that would have caught it, when a test setup exists.
- If you can't reproduce, say what information you need rather than shotgun-editing.

## Anti-patterns
- Wrapping everything in try/catch to silence an error instead of fixing it.
- Multiple speculative changes at once so you can't tell what fixed it.
- "Fixing" by deleting the failing assertion.

## Checklist
- [ ] Root cause identified with evidence
- [ ] Minimal targeted fix
- [ ] Repro re-run and passes
- [ ] Regression test added where possible
