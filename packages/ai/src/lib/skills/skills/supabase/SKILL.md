---
name: supabase
description: Use for Supabase work — Postgres, Row Level Security, auth, storage, edge functions, client usage.
appliesTo: [supabase]
version: "1.0"
docs: [https://supabase.com/docs]
---

# Supabase

## When to use
Data, auth, storage, or realtime backed by Supabase.

## Rules
- **Enable Row Level Security on every table** that holds user data, and write
  explicit policies. RLS off = public table. This is the #1 Supabase security mistake.
- Use the `anon` key on the client (it is public by design); the `service_role` key
  is server-only and bypasses RLS — never ship it to the browser or a mobile bundle.
- Prefer the official `@supabase/supabase-js` client; for SSR use the `@supabase/ssr`
  helpers so auth cookies/sessions work on the server.
- Do schema changes via migrations (`supabase migration`), not ad-hoc dashboard edits,
  so environments stay reproducible.
- Use database functions/triggers and `select` policies for authorization logic rather
  than trusting the client.

## Anti-patterns
- Shipping the `service_role` key to the client.
- Tables with RLS disabled "to make it work."
- Building auth checks only in the frontend.

## Checklist
- [ ] RLS enabled + policies written for every user table
- [ ] service_role key server-only
- [ ] Schema changes via migrations
- [ ] SSR auth via @supabase/ssr where applicable
