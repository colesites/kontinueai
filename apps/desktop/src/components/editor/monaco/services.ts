// Settings for Monaco's built-in JSON and CSS language services.

import { css, json } from "./monaco";

const JSONC_FILES = [
  "*.jsonc",
  "tsconfig.json",
  "tsconfig.*.json",
  "jsconfig.json",
  "jsconfig.*.json",
  ".vscode/*.json",
  "*.code-workspace",
  ".eslintrc",
  ".eslintrc.json",
  ".babelrc",
  "babel.config.json",
  ".swcrc",
  "devcontainer.json",
  ".devcontainer.json",
  "turbo.json",
  "biome.json",
  "deno.json",
  "api-extractor.json",
  "language-configuration.json",
];

// Schemas are fetched from SchemaStore on demand. Offline, the file simply
// has no schema; no warning is shown for a schema that could not load.
const SCHEMAS: Array<{ url: string; fileMatch: string[]; jsonc?: boolean }> = [
  { url: "https://www.schemastore.org/package.json", fileMatch: ["package.json"] },
  { url: "https://www.schemastore.org/tsconfig.json", fileMatch: ["tsconfig.json", "tsconfig.*.json"], jsonc: true },
  { url: "https://www.schemastore.org/jsconfig.json", fileMatch: ["jsconfig.json", "jsconfig.*.json"], jsonc: true },
  { url: "https://www.schemastore.org/eslintrc.json", fileMatch: [".eslintrc", ".eslintrc.json"], jsonc: true },
  { url: "https://www.schemastore.org/prettierrc.json", fileMatch: [".prettierrc", ".prettierrc.json"] },
  { url: "https://www.schemastore.org/babelrc.json", fileMatch: [".babelrc", "babel.config.json"], jsonc: true },
  { url: "https://turborepo.dev/schema.json", fileMatch: ["turbo.json"], jsonc: true },
  { url: "https://openapi.vercel.sh/vercel.json", fileMatch: ["vercel.json"] },
  { url: "https://www.schemastore.org/lerna.json", fileMatch: ["lerna.json"] },
  { url: "https://www.schemastore.org/web-manifest-combined.json", fileMatch: ["*.webmanifest", "manifest.json", "site.webmanifest"] },
  { url: "https://raw.githubusercontent.com/devcontainers/spec/main/schemas/devContainer.schema.json", fileMatch: ["devcontainer.json", ".devcontainer.json"], jsonc: true },
];

let done = false;

export function configureLanguageServices() {
  if (done) return;
  done = true;

  const covered = new Set(SCHEMAS.filter((s) => s.jsonc).flatMap((s) => s.fileMatch));
  json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    comments: "error",
    trailingCommas: "error",
    enableSchemaRequest: true,
    schemaRequest: "ignore",
    schemaValidation: "warning",
    schemas: [
      ...SCHEMAS.map((schema) => ({
        uri: `kontinue://schemas/${encodeURIComponent(schema.url)}`,
        fileMatch: schema.fileMatch,
        schema: {
          allOf: [{ $ref: schema.url }],
          ...(schema.jsonc ? { allowComments: true, allowTrailingCommas: true } : {}),
        },
      })),
      {
        // Files that are JSON with comments but have no schema above.
        uri: "kontinue://schemas/jsonc",
        fileMatch: JSONC_FILES.filter((name) => !covered.has(name)),
        schema: { allowComments: true, allowTrailingCommas: true },
      },
    ],
  });
  // Highlighting comes from the TextMate grammar instead.
  json.jsonDefaults.setModeConfiguration({ ...json.jsonDefaults.modeConfiguration, tokens: false });

  // Tailwind and PostCSS at-rules (@tailwind, @apply, @theme, @custom-variant)
  // are valid in these projects; don't flag them as unknown.
  const lint = { unknownAtRules: "ignore" as const };
  for (const defaults of [css.cssDefaults, css.scssDefaults, css.lessDefaults]) {
    defaults.setOptions({ ...defaults.options, validate: true, lint: { ...defaults.options.lint, ...lint } });
  }
}
