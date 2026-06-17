---
name: project-structure
description: Use when organizing files/folders, setting up a repo, or deciding where new code belongs.
appliesTo: []
version: "1.0"
---

# Project Structure

## When to use
Scaffolding a project, adding a feature, or deciding where a file goes.

## Rules
- **Organize by feature/domain, not by file type** at scale. `features/billing/`
  with its components, hooks, and logic beats scattered `components/`, `hooks/`,
  `utils/` once the app grows.
- Keep a clear public surface per module: an `index.ts` that exports what's intended
  for outside use; treat the rest as internal.
- Colocate tests, styles, and small helpers with the code they serve.
- Mirror existing conventions in the repo before inventing new ones — consistency
  beats personal preference.
- In monorepos, share cross-app code via `packages/*`; don't reach across apps.
- Config and env at the root/app level; keep secrets in `.env` (with `.env.example`
  checked in, real `.env` gitignored).
- Name things by responsibility; avoid catch-all `utils`/`helpers`/`misc` dumps.

## Anti-patterns
- One giant `components/` and `utils/` folder for everything.
- Deep, arbitrary nesting that doesn't map to features.
- Cross-app imports instead of shared packages.

## Checklist
- [ ] Organized by feature/domain where it helps
- [ ] Clear module boundaries / public exports
- [ ] Matches existing repo conventions
- [ ] Shared code in packages, no cross-app reaching
