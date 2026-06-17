// Build a prebuilt docs index that ships with the app, so docs grounding works
// with zero cold start on first launch. Run with: `bun run build:docs`.
//
// Fetches each configured source (one URL per source), chunks + tags it, and
// writes the result to src/lib/kode-docs-seed.json (bundled by Vite). The app's
// startup refresh keeps it current after install.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { indexAllSources } from "@repo/ai/lib/docs/indexer";

const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/kode-docs-seed.json",
);

const chunks = await indexAllSources();
writeFileSync(outFile, JSON.stringify(chunks));
console.log(`Indexed ${chunks.length} chunks → ${outFile}`);
