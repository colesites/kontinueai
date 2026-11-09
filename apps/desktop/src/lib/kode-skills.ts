// Kode skills: reusable expert guides, loaded on demand.
//
// Follows the open Agent Skills format: each skill is a directory with a
// `SKILL.md` (YAML frontmatter + markdown body) and optional supporting files
// (references/, scripts/, assets/). The model sees a compact one-line index in
// its prompt and loads a skill's full body with the `load_skill` tool only when
// relevant, so unused guidance costs no context.
//
// Discovery locations:
//   project-level (relative to the open project) — .agents/skills, .claude/skills, .kode/skills
//   user-level (home directory)                 — ~/.agents/skills, ~/.claude/skills, ~/.kontinue/skills

import { invoke } from "@tauri-apps/api/core";
import { parseSkillMarkdown, validateSkill, type Skill } from "@repo/ai/lib/skills/schema";

const PROJECT_SKILL_DIRS = [".agents/skills", ".claude/skills", ".kode/skills"];

export type SkillScope = "user" | "project";

export type RepoProfile = {
  framework?: string | null;
  packageManager?: string | null;
  tags?: string[];
};

export type KodeSkill = Skill & {
  /** Where the skill lives (a directory path or a user skills root). */
  source: string;
  scope: SkillScope;
  /** Path used to resolve the skill's supporting files (references, scripts). */
  dir: string;
};

type UserSkillEntry = { name: string; dir: string; source: string; skill_md: string };

/** Skills the user installed in their home directory. */
export async function loadUserSkills(): Promise<KodeSkill[]> {
  let entries: UserSkillEntry[] = [];
  try {
    entries = await invoke<UserSkillEntry[]>("kode_discover_user_skills");
  } catch {
    return []; // Rust command missing or home dirs unavailable
  }
  const found: KodeSkill[] = [];
  for (const entry of entries) {
    const skill = parseEntry(entry.skill_md, entry.source, entry.dir, "user");
    if (skill) found.push(skill);
  }
  return found;
}

/** Skills shipped inside the open project (missing folders are fine). */
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
        const skill = parseEntry(raw, entry.path, entry.path, "project");
        if (skill) found.push(skill);
      } catch {
        // Not a skill folder, or unreadable — skip it.
      }
    }
  }
  return found;
}

/** User + project skills, deduplicated by name with project scope taking
 *  precedence (a project-specific skill overrides the user's global one). */
export async function loadAllSkills(root: string | null): Promise<KodeSkill[]> {
  const byName = new Map<string, KodeSkill>();
  for (const skill of await loadUserSkills()) byName.set(skill.name, skill);
  if (root) {
    for (const skill of await loadProjectSkills(root)) byName.set(skill.name, skill);
  }
  return [...byName.values()];
}

export function findSkill(skills: KodeSkill[], name: string): KodeSkill | undefined {
  const wanted = name.trim().toLowerCase();
  const matches = skills.filter((skill) => skill.name.toLowerCase() === wanted);
  // Prefer a project-scoped skill over a user-scoped one with the same name.
  return matches.find((skill) => skill.scope === "project") ?? matches[0];
}

/** Full text returned by `load_skill`. */
export function renderSkill(skill: KodeSkill): string {
  return `# Skill: ${skill.name}\n\n${skill.body}`;
}

export type SkillFile = { path: string; is_dir: boolean };

async function listProjectSkillFiles(root: string, dir: string): Promise<SkillFile[]> {
  const out: SkillFile[] = [];
  async function walk(rel: string) {
    const target = rel ? `${dir}/${rel}` : dir;
    let entries: { name: string; path: string; is_dir: boolean }[] = [];
    try {
      entries = await invoke("kode_list_dir", { root, path: target });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "SKILL.md") continue; // already loaded
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      out.push({ path: relPath, is_dir: entry.is_dir });
      if (entry.is_dir) await walk(relPath);
    }
  }
  await walk("");
  return out;
}

/** List the supporting files inside a skill (references, scripts, assets…). */
export async function listSkillFiles(skill: KodeSkill, root: string | null): Promise<SkillFile[]> {
  if (skill.scope === "user") {
    try {
      return await invoke<SkillFile[]>("kode_list_user_skill_files", { dir: skill.dir });
    } catch {
      return [];
    }
  }
  if (!root) return [];
  return listProjectSkillFiles(root, skill.dir);
}

/** Read a supporting file inside a skill, constrained to that skill's directory. */
export async function readSkillFile(skill: KodeSkill, root: string | null, rel: string): Promise<string> {
  if (skill.scope === "user") {
    return invoke<string>("kode_read_user_skill_file", { dir: skill.dir, rel });
  }
  if (!root) throw new Error("No project root is open");
  return invoke<string>("kode_read_file", { root, path: `${skill.dir}/${rel}` });
}

// ─── Enable / disable (persisted locally) ──────────────────────────────────

const DISABLED_KEY = "kode.disabledSkills.v1";

export function getDisabledSkills(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISABLED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function isSkillDisabled(name: string): boolean {
  return getDisabledSkills().includes(name);
}

export function setSkillDisabled(name: string, disabled: boolean): void {
  const set = new Set(getDisabledSkills());
  if (disabled) set.add(name);
  else set.delete(name);
  localStorage.setItem(DISABLED_KEY, JSON.stringify([...set]));
}

/** Skills the agent is allowed to load (disabled ones are hidden from context). */
export function enabledSkills(skills: KodeSkill[]): KodeSkill[] {
  return skills.filter((skill) => !isSkillDisabled(skill.name));
}

// ─── Active-skill preservation (survives model switches and restarts) ───────

const ACTIVE_KEY = (chatId: string) => `kode.activeSkills.${chatId}`;

/** Skill names that have been loaded/invoked for a chat. */
export function getActiveSkills(chatId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_KEY(chatId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Record the union of previously-active and newly-loaded skills, capped. */
export function setActiveSkills(chatId: string, names: string[]): void {
  const merged = [...new Set([...getActiveSkills(chatId), ...names])].slice(0, 8);
  localStorage.setItem(ACTIVE_KEY(chatId), JSON.stringify(merged));
}

// ─── Create / delete user skills ───────────────────────────────────────────

export type NewSkill = {
  name: string;
  description: string;
  license?: string;
  body: string;
};

/** Create a user-level skill under ~/.agents/skills/<name>/SKILL.md. */
export async function createUserSkill(input: NewSkill): Promise<string> {
  const frontmatter = [
    "---",
    `name: ${input.name}`,
    `description: ${input.description.replace(/\n/g, " ").trim()}`,
    ...(input.license ? [`license: ${input.license}`] : []),
    "---",
    "",
    input.body.trim(),
    "",
  ].join("\n");
  return invoke<string>("kode_write_user_skill", { name: input.name, skillMd: frontmatter });
}

/** Delete a user-level skill directory. */
export async function deleteUserSkill(dir: string): Promise<void> {
  await invoke("kode_delete_user_skill", { dir });
}

function parseEntry(raw: string, source: string, dir: string, scope: SkillScope): KodeSkill | null {
  try {
    const { frontmatter, body } = parseSkillMarkdown(raw);
    const result = validateSkill(frontmatter, body);
    if (!result.ok) {
      console.warn(`[skills] invalid ${dir}: ${result.errors.join("; ")}`);
      return null;
    }
    return { ...result.skill, source, dir, scope };
  } catch (error) {
    console.warn(`[skills] failed to parse ${dir}: ${String(error)}`);
    return null;
  }
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

/**
 * Repo summary + the skills index for the system prompt. Only names and
 * descriptions go in; the model loads full skills with `load_skill`.
 */
export function buildKodeSkillsContext(repo: RepoProfile, skills: KodeSkill[]): string {
  const index = skills
    .map((skill) => `- ${skill.name} (${skill.scope}): ${skill.description}`)
    .join("\n");
  const skillsBlock = skills.length
    ? `\n\nSKILLS — expert guides you can load with load_skill(name). Load the ones that fit the task before you start; skip the rest. Follow a loaded skill over generic advice.\n${index}`
    : "";
  return `${buildRepoContext(repo)}${skillsBlock}`;
}
