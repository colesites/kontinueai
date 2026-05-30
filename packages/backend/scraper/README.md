# Kontinue Scraper API

Self-hosted scraper API for shared AI chat links. This is intentionally outside
Convex so it can run as a normal HTTP service, similar to how Firecrawl is used.

## Run

```bash
bun run --cwd packages/backend/scraper dev
```

Defaults to `http://127.0.0.1:4000`.

## Environment

- `PORT`: HTTP port, defaults to `4000`
- `API_KEY`: required API key. Callers must send a matching `x-api-key` header.
- `ALLOWED_ORIGINS`: comma-separated CORS/origin allowlist (the `Origin` header
  must be in this list).
- `MAX_CONCURRENT_PAGES`: max simultaneous browser pages, defaults to `3`.
- `HEADLESS`: `false` to run a visible browser. **Required for Claude** —
  claude.ai shared links sit behind Cloudflare Turnstile, which only clears in a
  real (non-headless) Chrome. Defaults to headless.
- `BROWSER_CHANNEL`: Chrome channel, defaults to `chrome` (real Chrome, not the
  bundled Chromium — Cloudflare flags bundled Chromium).
- `BROWSER_EXECUTABLE_PATH` / `BROWSER_CDP_URL` / `BROWSER_PROFILE_DIR`: optional
  overrides for the browser binary, a remote CDP endpoint, or the profile dir.

## Supported platforms

Self-scrapeable (work headless, incl. datacenter IPs like Render):
**ChatGPT, Gemini, Grok, Qwen, DeepSeek, Kimi, MetaAI**, and **Manus** (best-effort —
Manus uses unstable utility classes).

Anti-bot walled — route these to Firecrawl instead of this scraper:
- **Claude** — Cloudflare Turnstile; only clears in real headed Chrome on a clean/residential IP.
- **T3Chat** — Vercel Security Checkpoint ("Code 21"); rejects automated browsers.
- **Perplexity / Copilot** — share links observed either errored/private or gated behind a join flow.

## Deploy to Render

`Dockerfile` + `render.yaml` are included. Create a Web Service with Runtime=Docker
and Root Directory `packages/backend/scraper` (or use the Blueprint). Render runs
headless, which is fine for every self-scrapeable platform above. Set `API_KEY` and
`ALLOWED_ORIGINS` in the dashboard. Claude/T3Chat won't work from Render's datacenter
IP — that's expected; they go through Firecrawl.

### Cloudflare / Claude on a headless server

Claude requires a headed Chrome. On a VPS with no display, run the process under
a virtual framebuffer:

```bash
xvfb-run -a bun src/index.ts
```

The browser profile (`.browser-profile/`) is created on first launch and is
git-ignored. If Cloudflare starts blocking after heavy automated traffic, delete
the profile dir to reset the session.

## Endpoints

### `POST /v1/scrape`

Firecrawl-like response shape.

```json
{
  "url": "https://chatgpt.com/share/...",
  "formats": ["markdown", "html"]
}
```

Returns:

```json
{
  "success": true,
  "data": {
    "markdown": "[USER]: ...",
    "html": "<html>...</html>",
    "metadata": {},
    "title": "Imported Chat",
    "provider": "chatgpt",
    "messages": []
  }
}
```

### `POST /scrape-chat`

Legacy demo response shape used by `apps/scraper`.

```json
{
  "url": "https://chatgpt.com/share/..."
}
```

### `POST /ingest-chat`

Accepts already-extracted extension/client messages and normalizes them into the
same response shape as `/scrape-chat`.

