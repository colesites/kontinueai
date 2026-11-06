// Kode skills: expert guides the agent loads on demand.
//
// Like Claude / Vercel agent skills, the model only sees a one-line index
// (name + description) in its prompt and loads a skill's full body with the
// `load_skill` tool when it's relevant, so unused guidance costs no context.
//
// Sources, later ones overriding earlier ones by name:
//   1. Bundled skills in @repo/ai (packages/ai/src/lib/skills/skills/*/SKILL.md)
//   2. The open project's own skills: .agents/skills, .claude/skills, .kode/skills
//      (same SKILL.md format, so existing Claude / Vercel skills drop in).

import { invoke } from "@tauri-apps/api/core";
import { parseSkillMarkdown, type Skill } from "@repo/ai/lib/skills/schema";
import { buildRepoContext, type RepoProfile } from "@repo/ai/lib/skills/select";

// Eagerly import every bundled SKILL.md as a raw string. Path is relative to
// this file: apps/desktop/src/lib → repo root → packages/ai/src/lib/skills/skills.
const rawSkills = import.meta.glob(
  "../../../../packages/ai/src/lib/skills/skills/*/SKILL.md",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const PROJECT_SKILL_DIRS = [".agents/skills", ".claude/skills", ".kode/skills"];

export type KodeSkill = Skill & { source: "bundled" | "project" };

let bundledCache: KodeSkill[] | null = null;

export function loadKodeSkills(): KodeSkill[] {
  if (bundledCache) return bundledCache;
  const skills: KodeSkill[] = [];
  for (const [path, raw] of Object.entries(rawSkills)) {
    try {
      skills.push({ ...parseSkillMarkdown(raw), source: "bundled" });
    } catch (error) {
      console.warn(`[skills] failed to parse ${path}: ${String(error)}`);
    }
  }
  bundledCache = skills;
  return skills;
}

/** Skills shipped inside the open project. Missing folders are fine. */
export async function loadProjectSkills(root: string): Promise<KodeSkill[]> {
  const found: KodeSkill[] = [];
  for (const dir of PROJECT_SKILL_DIRS) {
    let entries: { name: string; path: string; is_dir: boolean }[] = [];
    try {
      entries = await invoke("kode_list_dir", { root, path: dir });
    } catch {
      continue; // folder doesn't exist
    }
    for (const entry of entries.filter((e) => e.is_dir)) {
      try {
        const raw = await invoke<string>("kode_read_file", { root, path: `${entry.path}/SKILL.md` });
        found.push({ ...parseSkillMarkdown(raw), source: "project" });
      } catch {
        // Not a skill folder, or unreadable — skip it.
      }
    }
  }
  return found;
}

/** Bundled + project skills; a project skill replaces a bundled one with the same name. */
export async function loadAllSkills(root: string | null): Promise<KodeSkill[]> {
  const byName = new Map<string, KodeSkill>();
  for (const skill of loadKodeSkills()) byName.set(skill.name, skill);
  if (root) for (const skill of await loadProjectSkills(root)) byName.set(skill.name, skill);
  return [...byName.values()];
}

export function findSkill(skills: KodeSkill[], name: string): KodeSkill | undefined {
  const wanted = name.trim().toLowerCase();
  return skills.find((skill) => skill.name.toLowerCase() === wanted);
}

/** Full text returned by load_skill. */
export function renderSkill(skill: KodeSkill): string {
  const docs = skill.docs?.length ? `\nOfficial docs: ${skill.docs.join(", ")}` : "";
  return `# Skill: ${skill.name}${docs}\n\n${skill.body}`;
}

export type { RepoProfile };

/**
 * Repo summary + the skills index for the system prompt. Only names and
 * descriptions go in; the model loads full skills with load_skill.
 */
export function buildKodeSkillsContext(repo: RepoProfile, skills: KodeSkill[]): string {
  const index = skills
    .map((skill) => `- ${skill.name}${skill.source === "project" ? " (project)" : ""}: ${skill.description}`)
    .join("\n");
  const skillsBlock = skills.length
    ? `\n\nSKILLS — expert guides you can load with load_skill(name). Load the ones that fit the task before you start (for example the framework you're working in); skip the rest. Follow a loaded skill over generic advice.\n${index}`
    : "";
  return `${buildRepoContext(repo)}${skillsBlock}`;
}
