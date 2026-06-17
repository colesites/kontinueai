---
name: database-design
description: Use when modeling schemas, relations, indexes, or making data-layer design decisions.
appliesTo: [prisma, supabase, neon]
version: "1.0"
docs: [https://www.prisma.io/docs, https://neon.com/docs]
---

# Database Design

## When to use
Designing tables, relationships, indexes, or choosing data types.

## Rules
- Normalize to remove duplication (aim for 3NF), then **denormalize deliberately**
  only where read performance demands it — and document why.
- Pick correct types: `timestamptz` for times, `uuid`/`bigint` keys, `numeric` for
  money (never float), enums/check constraints for fixed sets.
- Enforce integrity in the DB: primary keys, foreign keys, `NOT NULL`, unique
  constraints — don't rely on app code alone.
- **Index for your query patterns**: foreign keys, columns in `WHERE`/`ORDER BY`/joins.
  Don't over-index (slows writes); measure with `EXPLAIN`.
- Model relations explicitly (1-1, 1-many, many-many via join tables).
- Plan for soft deletes / audit fields (`created_at`, `updated_at`) when needed.
- Use migrations for every schema change; never mutate prod schema by hand.

## Anti-patterns
- Storing money as float, or timestamps without timezone.
- No foreign keys / constraints ("we'll enforce it in code").
- Missing indexes on join/filter columns, or indexing everything.

## Checklist
- [ ] Appropriate types + constraints (PK/FK/unique/not null)
- [ ] Indexes match real query patterns
- [ ] Relations modeled explicitly
- [ ] Changes via migrations
