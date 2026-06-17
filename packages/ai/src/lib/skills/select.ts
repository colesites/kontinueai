// Pure, dependency-free skill selection. No `node:fs`, so this is safe to import
// in any environment (Next server, Vite browser/Tauri). The caller supplies the
// already-loaded skills array; loading strategy differs per environment.

import type { Skill } from "./schema";

export type RepoProfile = {
  /** e.g. "next", "expo", "react", "node". */
  framework?: string | null;
  /** Detected package manager: "bun" | "npm" | "pnpm" | "yarn". */
  packageManager?: string | null;
  /** Detected tech tags from dependencies: ["tailwind","prisma","supabase",…]. */
  tags?: string[];
};

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it",
  "my", "me", "i", "how", "do", "can", "with", "this", "that", "please",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function scoreSkill(
  skill: Skill,
  queryTokens: string[],
  repo: RepoProfile,
): number {
  let score = 0;
  const haystack = `${skill.name} ${skill.description}`.toLowerCase();

  for (const t of queryTokens) {
    if (skill.name.toLowerCase().includes(t)) score += 3;
    else if (haystack.includes(t)) score += 1;
    if (skill.appliesTo.some((a) => a.toLowerCase() === t)) score += 2;
  }

  // Repo-context boost: a skill tagged for the detected framework/deps is
  // relevant even if the user didn't name it.
  const repoTags = [repo.framework, ...(repo.tags ?? [])]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (skill.appliesTo.some((a) => repoTags.includes(a.toLowerCase()))) {
    score += 2;
  }

  // Always-applicable skills (no appliesTo) get a small floor.
  if (skill.appliesTo.length === 0) score += 0.5;

  return score;
}

export function selectFromSkills(
  query: string,
  repo: RepoProfile,
  skills: Skill[],
  limit = 3,
): Skill[] {
  const queryTokens = tokens(query);
  return skills
    .map((skill) => ({ skill, score: scoreSkill(skill, queryTokens, repo) }))
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.skill);
}

/** Render selected skills into a system-prompt block, ready to inject. */
export function buildSkillsContext(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const blocks = skills.map(
    (s) =>
      `### Skill: ${s.name}${s.docs?.length ? `\nOfficial docs: ${s.docs.join(", ")}` : ""}\n${s.body}`,
  );
  return [
    "\n\nACTIVE SKILLS — apply this expert guidance to your answer.",
    "Follow these rules over generic advice. Cite the official docs when relevant.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

/** Short one-line summary of the repo for the system prompt. */
export function buildRepoContext(repo: RepoProfile): string {
  const parts: string[] = [];
  if (repo.framework) parts.push(`framework: ${repo.framework}`);
  if (repo.packageManager) parts.push(`package manager: ${repo.packageManager}`);
  if (repo.tags?.length) parts.push(`tech: ${repo.tags.join(", ")}`);
  if (parts.length === 0) return "";
  return `\n\nPROJECT CONTEXT — ${parts.join("; ")}. Prefer these conventions and the project's existing package manager.`;
}
