// Skill registry — loads every SKILL.md under ./skills, parses frontmatter, and
// caches the result for the process lifetime.
//
// NOTE on bundling: this reads files from disk at module load using fs. In a
// Next.js serverless build the SKILL.md files must be traced into the function.
// Add to apps/web/next.config.* :
//
//   outputFileTracingIncludes: {
//     "/api/chat": ["../../packages/ai/src/lib/skills/skills/**/*.md"],
//   }
//
// For a Tauri/desktop build the files ship with the app bundle and load directly.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillMarkdown, type Skill } from "./schema";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "skills");

let cache: Skill[] | null = null;

export function loadSkills(): Skill[] {
  if (cache) return cache;
  const skills: Skill[] = [];
  if (!existsSync(SKILLS_DIR)) {
    cache = skills;
    return skills;
  }
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!existsSync(file)) continue;
    try {
      skills.push(parseSkillMarkdown(readFileSync(file, "utf8")));
    } catch (error) {
      console.warn(`[skills] failed to load ${entry.name}: ${String(error)}`);
    }
  }
  cache = skills;
  return skills;
}

export function getSkill(name: string): Skill | undefined {
  return loadSkills().find((s) => s.name === name);
}

/** A compact catalog (name + description) for the router / find-skills prompt. */
export function skillCatalog(): { name: string; description: string }[] {
  return loadSkills().map(({ name, description }) => ({ name, description }));
}
