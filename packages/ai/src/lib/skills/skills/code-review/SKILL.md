---
name: code-review
description: Use when reviewing a diff or file for correctness, security, clarity, and maintainability.
appliesTo: []
version: "1.0"
---

# Code Review

## When to use
Reviewing changes, a PR, or a file the user wants feedback on.

## What to check, in priority order
1. **Correctness** — does it do what it claims? Edge cases, off-by-one, null/undefined,
   error paths, race conditions, async handling.
2. **Security** — input validation, injection, secrets in code, authz checks,
   unsafe deserialization. (Defer to the `security` skill when present.)
3. **Reuse / simplicity** — duplicated logic, code that reimplements something the
   codebase already has, needless complexity.
4. **Consistency** — matches surrounding naming, structure, and conventions.
5. **Tests** — meaningful coverage for the new behavior.

## Rules
- Lead with the highest-severity issues; don't bury a real bug under nits.
- Be concrete: cite the line and show the fix, don't just describe it.
- Separate "must fix" (bugs, security) from "nice to have" (style).
- If the change is good, say so plainly instead of inventing problems.

## Anti-patterns
- Style-only nitpicking while missing a correctness bug.
- Vague comments like "this could be better" with no actionable fix.

## Checklist
- [ ] Correctness and edge cases reviewed
- [ ] Security implications considered
- [ ] No duplicated/dead code introduced
- [ ] Matches project conventions
- [ ] Tests adequate
