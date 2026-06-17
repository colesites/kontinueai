---
name: clean-architecture
description: Use when structuring app layers, separating concerns, or refactoring tangled business logic.
appliesTo: []
version: "1.0"
---

# Clean Architecture

## When to use
Designing module boundaries, or refactoring code that mixes concerns.

## Rules
- Separate layers: **UI / presentation** → **application / use-cases** → **domain**
  → **infrastructure** (DB, APIs). Dependencies point inward; the domain knows
  nothing about React, Prisma, or HTTP.
- Keep business logic out of components and route handlers. Components render; use
  cases decide; repositories persist.
- Depend on interfaces, not concrete implementations, at boundaries you may swap
  (e.g. a `UserRepository` interface over Prisma).
- Pure functions for business rules → easy to test without mocks.
- One reason to change per module (single responsibility). If a file does fetching,
  validation, and rendering, split it.

## Anti-patterns
- Fat components/controllers that query the DB and contain business rules.
- Domain code importing framework or ORM types.
- "Utils" dumping grounds with unrelated helpers.

## Checklist
- [ ] Business logic isolated from UI and I/O
- [ ] Dependencies point inward
- [ ] Swappable boundaries behind interfaces
- [ ] Each module has a single responsibility
