---
name: nextjs-app-router
description: Use for Next.js App Router work — Server vs Client Components, data fetching, routing, caching, metadata.
appliesTo: [next, nextjs]
version: "1.0"
docs: [https://nextjs.org/docs]
---

# Next.js App Router

## When to use
Any task in a Next.js app using the `app/` directory.

## Rules
- Components are **Server Components by default**. Add `"use client"` only when you
  need state, effects, event handlers, or browser APIs. Push `"use client"` to the
  leaves; keep data fetching on the server.
- Fetch data in Server Components with `async`/`await`; don't fetch in client
  effects when the server can do it.
- `params` and `searchParams` are async in current Next.js — `await` them.
- Use Server Actions for mutations; revalidate with `revalidatePath`/`revalidateTag`
  (or `updateTag` with Cache Components) instead of manual refetching.
- Set `metadata` via the `generateMetadata`/`metadata` export, not `<head>` hacks.
- Use `next/image` and `next/font` for images and fonts.
- Keep secrets server-only; never import a server util into a `"use client"` file.

## Anti-patterns
- Marking a whole page `"use client"` to use one small interactive widget.
- Fetching in `useEffect` for data that could be fetched on the server.
- Reading `process.env` secrets in client components.

## Checklist
- [ ] Client boundary is as small as possible
- [ ] `params`/`searchParams` awaited
- [ ] Mutations via Server Actions + revalidation
- [ ] No secrets in client bundles
