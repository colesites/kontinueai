// Kode IDE skills loader. The SKILL.md files live in @repo/ai; Vite bundles them
// into the renderer as raw strings at build time (no node:fs in the browser).

import { parseSkillMarkdown, type Skill } from "@repo/ai/lib/skills/schema";
import {
  buildRepoContext,
  buildSkillsContext,
  selectFromSkills,
  type RepoProfile,
} from "@repo/ai/lib/skills/select";

// Eagerly import every SKILL.md as a raw string. Path is relative to this file:
// apps/kode-ide/src/lib → repo root → packages/ai/src/lib/skills/skills.
const rawSkills = import.meta.glob(
  "../../../../packages/ai/src/lib/skills/skills/*/SKILL.md",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

let cache: Skill[] | null = null;

export function loadKodeSkills(): Skill[] {
  if (cache) return cache;
  const skills: Skill[] = [];
  for (const [path, raw] of Object.entries(rawSkills)) {
    try {
      skills.push(parseSkillMarkdown(raw));
    } catch (error) {
      console.warn(`[skills] failed to parse ${path}: ${String(error)}`);
    }
  }
  cache = skills;
  return skills;
}

export type { RepoProfile };

/**
 * Build the combined repo + skills system-prompt context for a request. Returns
 * an empty string when nothing relevant is found (so the base prompt is unchanged).
 */
export function buildKodeSkillsContext(
  query: string,
  repo: RepoProfile,
): string {
  const selected = selectFromSkills(query, repo, loadKodeSkills());
  return `${buildRepoContext(repo)}${buildSkillsContext(selected)}`;
}
