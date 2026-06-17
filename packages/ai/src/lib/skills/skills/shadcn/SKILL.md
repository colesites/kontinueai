---
name: shadcn
description: Use when adding or customizing shadcn/ui components — CLI install, composition, theming over Tailwind.
appliesTo: [shadcn, next, react, tailwind]
version: "1.0"
docs: [https://ui.shadcn.com/docs/installation]
---

# shadcn/ui

## When to use
Adding UI primitives (button, dialog, form, table) via shadcn/ui.

## Rules
- shadcn/ui is **copy-in source, not a dependency**. Install components with the
  CLI (`npx shadcn@latest add <component>`); they land in your repo and you own them.
- Run `npx shadcn@latest init` once to set up `components.json`, the `cn()` helper,
  and theme tokens before adding components.
- Customize by editing the generated component file directly — don't wrap and fight it.
- Theme via CSS variables in `globals.css`; keep light/dark tokens in sync.
- Build product UI by **composing** primitives, not by forking the design system.
- Use the form primitives with `react-hook-form` + a zod resolver for validation.

## Anti-patterns
- `npm install`ing shadcn components as if they were a package.
- Overriding styles with `!important` instead of editing the component/tokens.
- Re-adding a component (overwrites your customizations) — diff before accepting.

## Checklist
- [ ] `init` run, `components.json` present
- [ ] Components added via CLI, customized in place
- [ ] Theme tokens cover light + dark
