# Kode AI Skills System

Expert rule-sets that make Kode 1.0 AI better at coding tasks, injected into the
chat system prompt at request time.

## How it works

```
request + repo profile
        │
   selectSkills()   ← router.ts  (keyword + framework-tag scoring)
        │
   buildSkillsContext()  → markdown block injected into the system prompt
```

- **schema.ts** — `Skill` type + `parseSkillMarkdown` (frontmatter parser, no deps).
- **registry.ts** — loads every `skills/<name>/SKILL.md`, parses, caches.
- **router.ts** — `selectSkills(query, repoProfile, limit)` and `buildSkillsContext`.
- **skills/** — the SKILL.md files (source of truth, portable to Anthropic/Vercel).

## Skill file format

```markdown
---
name: react-best-practices
description: One line the router matches against.
appliesTo: [react, next, expo]   # framework tags; empty = always-applicable
version: "1.0"
docs: [https://react.dev]
---

# Title
## When to use / When NOT to use
## Rules / Examples / Anti-patterns / Checklist
```

## Wiring into the chat route (next step)

In `apps/web/src/app/api/chat/lib/tools-config.ts`, after the identity context:

```ts
import { selectSkills, buildSkillsContext } from "@repo/ai/lib/skills/router";

const skills = selectSkills(lastUserContent, repoProfile);
// systemPrompt = identityContext + buildSkillsContext(skills) + CHAT_SYSTEM_PROMPT + ...
```

For Next.js serverless, trace the markdown into the function (see note in
`registry.ts`). `repoProfile` comes from the repo inspector (v1 next item) — the
Tauri side reads `package.json`/configs and sends a `{ framework, tags }` object.

## Adding a skill

Create `skills/<kebab-name>/SKILL.md` with valid frontmatter. It's picked up
automatically — no code change.

## Roadmap

- **v1:** static skills + keyword router + repo profile (in progress).
- **v2:** embedding-based routing; docs RAG (see `../docs/sources.json`) over
  Convex vector search; full 15-skill set; eval suite.
