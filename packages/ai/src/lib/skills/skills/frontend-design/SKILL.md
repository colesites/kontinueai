---
name: frontend-design
description: Use when building UI that should look polished and distinctive, not generic AI-template aesthetics.
appliesTo: [react, next, tailwind, shadcn]
version: "1.0"
docs: [https://ui.shadcn.com/docs]
---

# Frontend Design

## When to use
Building pages, components, or layouts where visual quality matters.

## Rules
- Establish a **type scale** and **spacing scale** and stick to them; consistent
  rhythm reads as "designed."
- Use a restrained palette: one or two accent colors over a neutral base. Pull from
  theme tokens, not random hex values.
- Create hierarchy with size, weight, and spacing — not borders and boxes everywhere.
- Give content room: generous whitespace, sensible max line length (~60–75ch) for text.
- Polish the details: hover/focus/active states, transitions, empty states, loading
  skeletons, and error states. These separate prototype from product.
- Respect motion and contrast accessibility (reduced-motion, WCAG contrast).
- Avoid the generic "AI look": identical card grids, purple gradients, emoji bullets,
  centered everything. Aim for intentional, brand-consistent design.

## Anti-patterns
- Arbitrary inconsistent spacing/sizes.
- No interaction states or loading/empty states.
- Decorative borders/shadows substituting for real hierarchy.

## Checklist
- [ ] Consistent type + spacing scale
- [ ] Restrained, token-based palette
- [ ] Hover/focus/loading/empty/error states handled
- [ ] Accessible contrast + reduced-motion respected
