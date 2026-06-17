---
name: find-skills
description: Use first on any coding task to discover which Kode skills apply before answering or editing files.
appliesTo: []
version: "1.0"
---

# Finding and Applying Skills

Before answering a coding request or editing files, decide which skills apply.
Skills are expert rule-sets that override your generic priors.

## Procedure

1. **Read the request and the repo profile.** Note the framework, package
   manager, and dependencies provided in context.
2. **Match against the skill catalog.** Each skill has a one-line description.
   Pick the 1–3 whose description best fits the task. Prefer fewer, high-relevance
   skills over many weak ones.
3. **Apply framework-specific skills first**, then cross-cutting ones
   (clean-architecture, security, debugging, code-review).
4. **If no skill clearly fits**, proceed with general best practices and say so.

## Rules

- Never invent a skill that isn't in the catalog.
- A skill's guidance outranks your training-data habits when they conflict.
- If a skill links official docs and you are unsure of an API, retrieve/cite the
  docs rather than guessing.

## Anti-patterns

- Loading every skill "to be safe" — it dilutes the guidance and wastes context.
- Ignoring the repo profile and giving advice for the wrong framework.
