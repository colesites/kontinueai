# Scraper API for Render. Build context = this directory (set Render "Root
# Directory" to packages/backend/scraper). Runtime deps (playwright/hono/cheerio)
# are standalone; the only workspace dep is a typecheck-time devDependency, so
# `bun install --production` builds without the monorepo.
FROM oven/bun:1.3.5

WORKDIR /app

# Install only runtime deps. Drop devDependencies first — the sole devDep is a
# `workspace:*` typescript-config that doesn't exist outside the monorepo and
# would otherwise abort the install.
COPY package.json ./
RUN bun -e "const p=require('./package.json'); delete p.devDependencies; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))" \
    && bun install

# Install Chromium + its system libraries (headless path for ChatGPT/Gemini/Grok/etc).
RUN bunx playwright install --with-deps chromium

# ffmpeg for K-Video long-form rendering (concatenating per-scene clips + audio).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Headless on Render: datacenter IP can't clear Claude/T3Chat anti-bot anyway —
# those route to Firecrawl. Render injects PORT at runtime.
ENV HEADLESS=true
ENV NODE_ENV=production

EXPOSE 4000

CMD ["bun", "src/index.ts"]
