// Fails if the desktop app calls a Convex function that the target deployment
// doesn't have, e.g. a release built from main while production still runs older
// backend code ("[CONVEX Q(kode:getRecentMessages)] Server Error").
//
//   node apps/desktop/scripts/check-convex-functions.mjs           # production
//   node apps/desktop/scripts/check-convex-functions.mjs --dev     # your dev deployment
//
// Run it before a release, after deploying the backend. It uses your
// `npx convex login` (or a CONVEX_DEPLOY_KEY with deployment:data:view). The
// function list comes from the typed API map in apps/desktop/src/lib/convex-api.ts.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const backend = path.resolve(desktop, "../../packages/backend/convex");
const require = createRequire(path.join(desktop, "package.json"));
const ts = require("typescript");

/** "kode:getRecentMessages" for every FunctionReference reachable from the exported API objects. */
function declaredFunctions() {
  const file = path.join(desktop, "src/lib/convex-api.ts");
  const config = ts.getParsedCommandLineOfConfigFile(path.join(desktop, "tsconfig.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic() {},
  });
  const program = ts.createProgram([file], config.options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const found = new Set();

  const walk = (type, parts, depth) => {
    if (depth > 6) return;
    const name = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
    if (name === "FunctionReference") {
      if (parts.length >= 2) found.add(`${parts.slice(0, -1).join("/")}:${parts.at(-1)}`);
      return;
    }
    for (const prop of checker.getPropertiesOfType(type)) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!decl) continue;
      walk(checker.getTypeOfSymbolAtLocation(prop, decl), [...parts, prop.getName()], depth + 1);
    }
  };

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of statement.declarationList.declarations) walk(checker.getTypeAtLocation(decl.name), [], 0);
  }
  return found;
}

function deployedFunctions(dev) {
  const args = ["convex", "function-spec"];
  if (!dev && !process.env.CONVEX_DEPLOY_KEY) args.push("--prod");
  // Windows runs npx through npx.cmd, which needs a shell.
  const out = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", args, {
    cwd: backend,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
  });
  const spec = JSON.parse(out.slice(out.indexOf("{")));
  return new Set(spec.functions.filter((fn) => fn.identifier).map((fn) => fn.identifier.replace(/\.js:/, ":")));
}

const dev = process.argv.includes("--dev");
const declared = declaredFunctions();
const deployed = deployedFunctions(dev);
const missing = [...declared].filter((name) => !deployed.has(name)).sort();
const target = dev ? "the dev deployment" : "production";

if (declared.size < 10) {
  console.error(`Only found ${declared.size} functions in convex-api.ts; the check itself looks broken.`);
  process.exit(2);
}
if (missing.length) {
  console.error(`The desktop app calls ${missing.length} Convex function(s) that ${target} doesn't have:`);
  for (const name of missing) console.error(`  - ${name}`);
  console.error(`\nDeploy the backend first: cd packages/backend/convex && npx convex deploy`);
  process.exit(1);
}
console.log(`OK: all ${declared.size} Convex functions the desktop app uses exist on ${target}.`);
