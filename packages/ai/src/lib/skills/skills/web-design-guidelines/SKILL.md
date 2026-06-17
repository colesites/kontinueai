---
name: web-design-guidelines
description: Use to review UI code for accessibility, usability, and web interface best-practice compliance.
appliesTo: []
version: "1.0"
---

# Web Design Guidelines

## When to use
Reviewing or auditing UI for accessibility and usability.

## Rules
- **Semantics first:** use `button`, `a`, `nav`, `main`, `label`, headings in order.
  ARIA is a fallback, not a substitute for the right element.
- Every interactive control is keyboard-operable and has a visible focus indicator
  (`:focus-visible`). Don't remove outlines without replacing them.
- Form fields have associated `<label>`s; errors are announced and tied to the field.
- Color is never the only signal (also use text/icon); meet WCAG AA contrast (4.5:1 text).
- Touch targets ≥ ~44px; clickable areas large enough on mobile.
- Honor `prefers-reduced-motion`; don't autoplay motion that can't be paused.
- Images have meaningful `alt` (or empty alt if decorative).
- Responsive down to small viewports without horizontal scroll or clipped content.

## Anti-patterns
- `<div onClick>` for buttons/links (not keyboard/AT accessible).
- Placeholder used as the only label.
- Removing focus outlines for "cleanliness."

## Checklist
- [ ] Semantic elements + heading order
- [ ] Keyboard operable, visible focus
- [ ] Labels + announced errors on forms
- [ ] AA contrast, color not sole signal
- [ ] Reduced-motion respected, responsive
