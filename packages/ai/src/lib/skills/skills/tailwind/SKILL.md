---
name: tailwind
description: Use for styling with Tailwind CSS — utility classes, v4 setup, design tokens, responsive and dark mode.
appliesTo: [tailwind, next, react, expo]
version: "4.0"
docs: [https://tailwindcss.com/docs, https://tailwindcss.com/docs/upgrade-guide]
---

# Tailwind CSS

## When to use
Styling components with Tailwind utility classes.

## Rules
- Tailwind v4 configures via CSS (`@import "tailwindcss"` + `@theme`), not a large
  `tailwind.config.js`. Check which major version the repo uses before advising.
- Use design tokens (theme variables) for color/spacing instead of arbitrary hex
  values, so dark mode and theming stay consistent.
- Compose utilities directly in markup; extract a component (not an `@apply` blob)
  when a pattern repeats.
- Use responsive (`md:`, `lg:`) and state (`hover:`, `focus-visible:`) variants
  rather than custom media queries.
- For conditional classes use a helper like `clsx`/`cn`; don't build class strings
  with messy ternaries.

## Anti-patterns
- Sprinkling arbitrary values (`text-[#3b3b3b]`, `mt-[7px]`) instead of tokens.
- Re-introducing a separate CSS file for things utilities already cover.
- Overusing `@apply` to recreate Bootstrap-style component classes.

## Checklist
- [ ] Matches the repo's Tailwind major version
- [ ] Theme tokens used for color/spacing
- [ ] Dark mode + focus-visible states handled
