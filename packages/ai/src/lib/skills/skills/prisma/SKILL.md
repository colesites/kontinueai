---
name: prisma
description: Use for Prisma ORM work — schema modeling, migrations, queries, relations, client usage.
appliesTo: [prisma]
version: "1.0"
docs: [https://www.prisma.io/docs]
---

# Prisma

## When to use
Modeling data or querying a database through Prisma.

## Rules
- The `schema.prisma` file is the source of truth. Change models there, then run
  `prisma migrate dev` (dev) / `prisma migrate deploy` (prod). Don't hand-edit the DB.
- Instantiate **one** `PrismaClient` and reuse it (singleton); in serverless/Next.js
  guard against hot-reload creating many clients (`globalThis` pattern).
- Use `select`/`include` to fetch only needed fields and relations; avoid over-fetching.
- Prevent N+1 by loading relations with `include` or batched queries, not per-row loops.
- Use transactions (`prisma.$transaction`) for multi-step writes that must be atomic.
- Run `prisma generate` after schema changes so the typed client matches.

## Anti-patterns
- `new PrismaClient()` per request (exhausts DB connections).
- Looping queries inside a `.map` (classic N+1).
- Editing the database manually so it drifts from the schema/migrations.

## Checklist
- [ ] Schema-first changes + migration generated
- [ ] Single reusable client (serverless-safe)
- [ ] Relations loaded without N+1
- [ ] Multi-step writes in a transaction
