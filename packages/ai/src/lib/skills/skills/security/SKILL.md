---
name: security
description: Use when handling secrets, auth, user input, or reviewing code for security risks.
appliesTo: []
version: "1.0"
---

# Security

## When to use
Any code touching secrets, authentication, authorization, user input, or external data.

## Rules
- **Never hardcode or print secrets.** Keys/tokens come from env; never log `.env`
  values, API keys, or tokens. Redact on display.
- Validate and sanitize all external input (request bodies, params, webhooks) — use a
  schema (zod) at the boundary. Never trust the client.
- Prevent injection: parameterized queries / ORM bindings (no string-built SQL),
  escape output, avoid `eval`/dynamic `require` on user input.
- Enforce authorization on the **server** for every protected action; don't rely on
  hidden UI. Check ownership, not just authentication.
- Keep `service_role`/admin/secret keys server-only; the client gets public keys only.
- Set security headers, use HTTPS, httpOnly+SameSite cookies for sessions.
- Don't leak internals in error messages returned to users; log details server-side.

## Anti-patterns
- Secrets committed to the repo or shipped in the client bundle.
- Trusting client-sent role/user IDs for authorization.
- Building SQL by string concatenation.

## Checklist
- [ ] No secrets in code, logs, or client bundle
- [ ] Input validated with a schema at the boundary
- [ ] Server-side authz with ownership checks
- [ ] Parameterized DB access, safe error messages
