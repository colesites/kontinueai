// Skill marketplace: browse and install skills from GitHub repos and the
// skills.sh registry. Installs land in ~/.agents/skills/<name>/ (user-level),
// preserving the original file tree, and source attribution is recorded locally
// so the UI can show where a skill came from.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { parseSkillMarkdown } from "@repo/ai/lib/skills/schema";

// ─── HTTP (via the Rust fetcher — no renderer CORS) ─────────────────────────

async function fetchText(url: string): Promise<string> {
  return invoke<string>("kode_fetch_text", { url });
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fetchText(url)) as Record<string, unknown>;
}

const BINARY_EXT = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|mp[34]|zip|gz|pdf)$/i;

// ─── GitHub helpers ─────────────────────────────────────────────────────────

function rawUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

/** Parse "owner/repo", "owner/repo/skill", or a full GitHub URL. */
export function parseRepoRef(input: string): { owner: string; repo: string; skill?: string } | null {
  let s = input.trim().replace(/^https?:\/\//, "").replace(/^github\.com\//, "");
  s = s.replace(/\/+$/, "").replace(/\.git$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0] ?? "", repo: parts[1] ?? "", skill: parts.length >= 3 ? parts.slice(2).join("/") : undefined };
}

/** Run `fn` over `items`, at most `limit` at a time, keeping order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Branch + file list per repo, kept for the session (one GitHub API call each).
const repoCache = new Map<string, Promise<{ branch: string; tree: string[] }>>();

function repoFiles(owner: string, repo: string): Promise<{ branch: string; tree: string[] }> {
  const key = `${owner}/${repo}`.toLowerCase();
  let entry = repoCache.get(key);
  if (!entry) {
    entry = (async () => {
      const branch = await repoDefaultBranch(owner, repo);
      return { branch, tree: await repoTree(owner, repo, branch) };
    })();
    entry.catch(() => repoCache.delete(key));
    repoCache.set(key, entry);
  }
  return entry;
}

async function repoDefaultBranch(owner: string, repo: string): Promise<string> {
  try {
    const meta = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    const branch = meta.default_branch;
    return typeof branch === "string" && branch ? branch : "main";
  } catch {
    return "main";
  }
}

async function repoTree(owner: string, repo: string, branch: string): Promise<string[]> {
  const data = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  const tree = data.tree;
  if (!Array.isArray(tree)) return [];
  return tree
    .filter((entry) => typeof entry === "object" && entry !== null && (entry as { type?: string }).type === "blob")
    .map((entry) => (entry as { path?: string }).path ?? "")
    .filter(Boolean);
}

export type SkillListing = {
  name: string;
  path: string; // directory containing SKILL.md, relative to repo root
  description?: string;
  license?: string;
};

/** Find every SKILL.md in a repo and read its name/description. */
export async function listRepoSkills(owner: string, repo: string): Promise<SkillListing[]> {
  const { branch, tree } = await repoFiles(owner, repo);
  const dirs = [...new Set(
    tree
      .filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
      .map((p) => (p === "SKILL.md" ? "" : p.slice(0, -"/SKILL.md".length))),
  )];

  return mapLimit(dirs.slice(0, 60), 8, async (dir): Promise<SkillListing> => {
    const path = dir ? `${dir}/SKILL.md` : "SKILL.md";
    try {
      const raw = await fetchText(rawUrl(owner, repo, branch, path));
      const { frontmatter } = parseSkillMarkdown(raw);
      return {
        name: typeof frontmatter.name === "string" ? frontmatter.name : (dir.split("/").pop() ?? repo),
        path: dir,
        description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
        license: typeof frontmatter.license === "string" ? frontmatter.license : undefined,
      };
    } catch {
      return { name: dir.split("/").pop() ?? repo, path: dir };
    }
  });
}

export type SkillBundleFile = { path: string; content: string };
export type SkillBundle = {
  name: string;
  files: SkillBundleFile[];
  source: string;
  sourceType: "github" | "local" | "zip";
  installUrl: string;
};

/** Download a skill's full file tree (without installing) for preview/inspection. */
export async function fetchGithubSkillFiles(owner: string, repo: string, skillDir: string): Promise<SkillBundle> {
  const { branch, tree } = await repoFiles(owner, repo);
  const prefix = skillDir ? `${skillDir}/` : "";
  const paths = tree.filter((path) => {
    const rel = path.slice(prefix.length);
    return path.startsWith(prefix) && !!rel && !BINARY_EXT.test(rel);
  });
  const fetched = await mapLimit(paths, 8, async (path) => {
    try {
      return { path: path.slice(prefix.length), content: await fetchText(rawUrl(owner, repo, branch, path)) };
    } catch {
      return null; // skip unreadable file
    }
  });
  const files = fetched.filter((f): f is SkillBundleFile => f !== null);

  const skillMd = files.find((f) => f.path === "SKILL.md");
  let name = skillDir.split("/").pop() ?? repo;
  if (skillMd) {
    try {
      const { frontmatter } = parseSkillMarkdown(skillMd.content);
      if (typeof frontmatter.name === "string") name = frontmatter.name;
    } catch {
      // keep the folder name
    }
  }

  const source = `${owner}/${repo}`;
  return { name, files, source, sourceType: "github", installUrl: `https://github.com/${owner}/${repo}` };
}

export type SkillAnalysis = {
  description?: string;
  license?: string;
  scripts: string[];
  fileCount: number;
};

/** Inspect a fetched skill for scripts/executables and surface its metadata. */
export function analyzeSkill(bundle: SkillBundle): SkillAnalysis {
  const scripts = bundle.files
    .filter((f) => /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|go|ps1)$/i.test(f.path) || f.path.startsWith("scripts/"))
    .map((f) => f.path);

  let description: string | undefined;
  let license: string | undefined;
  const skillMd = bundle.files.find((f) => f.path === "SKILL.md");
  if (skillMd) {
    try {
      const { frontmatter } = parseSkillMarkdown(skillMd.content);
      description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;
      license = typeof frontmatter.license === "string" ? frontmatter.license : undefined;
    } catch {
      // ignore malformed frontmatter
    }
  }
  return { scripts, fileCount: bundle.files.length, description, license };
}

/** Write a fetched skill bundle to disk and record its source attribution. */
export async function commitSkillInstall(bundle: SkillBundle): Promise<string> {
  const dir = await invoke<string>("kode_install_user_skill", { name: bundle.name, files: bundle.files });
  recordInstall({ name: bundle.name, source: bundle.source, sourceType: bundle.sourceType, installUrl: bundle.installUrl || undefined, installedAt: Date.now() });
  return dir;
}

/** Install a single skill directory from a GitHub repo into the user skills root. */
export async function installGithubSkill(owner: string, repo: string, skillDir: string): Promise<string> {
  return commitSkillInstall(await fetchGithubSkillFiles(owner, repo, skillDir));
}

// ─── Local folder / ZIP import ──────────────────────────────────────────────

function bundleFromFiles(files: SkillBundleFile[], fallbackName: string, sourceType: "local" | "zip", source: string): SkillBundle {
  const skillMd = files.find((f) => f.path === "SKILL.md");
  let name = fallbackName;
  if (skillMd) {
    try {
      const { frontmatter } = parseSkillMarkdown(skillMd.content);
      if (typeof frontmatter.name === "string") name = frontmatter.name;
    } catch {
      // keep the folder name
    }
  }
  return { name, files, source, sourceType, installUrl: source };
}

/** Pick a local skill folder and read its files (no install). */
export async function fetchLocalSkill(): Promise<SkillBundle> {
  const dir = await open({ directory: true, multiple: false, title: "Select a skill folder" });
  if (typeof dir !== "string") throw new Error("Import cancelled");
  const files = await invoke<SkillBundleFile[]>("kode_read_local_skill_dir", { dir });
  const fallback = dir.split(/[\\/]/).filter(Boolean).pop() ?? "skill";
  return bundleFromFiles(files, fallback, "local", dir);
}

/** Pick a .zip and extract its skill files (no install). */
export async function fetchZipSkill(): Promise<SkillBundle> {
  const path = await open({ multiple: false, title: "Select a skill ZIP", filters: [{ name: "ZIP", extensions: ["zip"] }] });
  if (typeof path !== "string") throw new Error("Import cancelled");
  const files = await invoke<SkillBundleFile[]>("kode_extract_skill_zip", { zipPath: path });
  return bundleFromFiles(files, "skill", "zip", path);
}

// ─── GitHub repository search (the skills.sh ecosystem is GitHub-backed) ────

export type SkillsShResult = {
  /** "owner/repo/skill" */
  id: string;
  /** GitHub "owner/repo" the skill lives in. */
  source: string;
  skillId: string;
  name: string;
  installs: number;
};

/** Search the skills.sh directory (public API). Only GitHub-hosted skills, which we can install. */
export async function searchSkillsSh(q: string): Promise<SkillsShResult[]> {
  const data = await fetchJson(`https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=40`);
  const skills = Array.isArray(data.skills) ? (data.skills as Record<string, unknown>[]) : [];
  return skills
    .map((item) => ({
      id: String(item.id ?? ""),
      source: String(item.source ?? ""),
      skillId: String(item.skillId ?? ""),
      name: String(item.name ?? item.skillId ?? ""),
      installs: typeof item.installs === "number" ? item.installs : 0,
    }))
    .filter((skill) => skill.skillId && /^[\w.-]+\/[\w.-]+$/.test(skill.source) && !skill.source.split("/")[0]?.includes("."));
}

/** Folder of a skill in a repo: the SKILL.md folder named after it, else the one whose name matches. */
export async function findSkillDir(owner: string, repo: string, skillId: string): Promise<string> {
  const { tree } = await repoFiles(owner, repo);
  const dirs = tree
    .filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
    .map((p) => (p === "SKILL.md" ? "" : p.slice(0, -"/SKILL.md".length)));
  const byFolder = dirs.find((dir) => dir.split("/").pop() === skillId);
  if (byFolder !== undefined) return byFolder;
  if (dirs.length === 1) return dirs[0] as string;

  // Otherwise read SKILL.md names, closest-looking folders first, and stop at the match.
  const { branch } = await repoFiles(owner, repo);
  const words = skillId.toLowerCase().split(/[-_]/);
  const score = (dir: string) => {
    const leaf = (dir.split("/").pop() ?? "").toLowerCase();
    return words.filter((w) => leaf.includes(w)).length;
  };
  const ordered = [...dirs].sort((a, b) => score(b) - score(a));
  for (let i = 0; i < ordered.length; i += 8) {
    const batch = ordered.slice(i, i + 8);
    const names = await mapLimit(batch, 8, async (dir) => {
      try {
        const raw = await fetchText(rawUrl(owner, repo, branch, dir ? `${dir}/SKILL.md` : "SKILL.md"));
        const { frontmatter } = parseSkillMarkdown(raw);
        return typeof frontmatter.name === "string" ? frontmatter.name : null;
      } catch {
        return null;
      }
    });
    const hit = names.findIndex((name) => name === skillId);
    if (hit >= 0) return batch[hit] as string;
  }
  throw new Error(`Couldn't find the "${skillId}" skill in ${owner}/${repo}.`);
}

// ─── Source attribution registry ────────────────────────────────────────────

const REGISTRY_KEY = "kode.installedSkills.v1";

export type InstalledSkillMeta = {
  name: string;
  source: string;
  sourceType: string;
  installUrl?: string;
  installedAt: number;
};

export function readInstalledRegistry(): Record<string, InstalledSkillMeta> {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "{}");
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function recordInstall(meta: InstalledSkillMeta): void {
  const registry = readInstalledRegistry();
  registry[meta.name] = meta;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

export function forgetInstall(name: string): void {
  const registry = readInstalledRegistry();
  delete registry[name];
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

// ─── Curated repos for quick browsing ───────────────────────────────────────

export const CURATED_REPOS: { owner: string; repo: string; label: string }[] = [
  { owner: "vercel-labs", repo: "agent-skills", label: "Vercel Agent Skills" },
  { owner: "anthropics", repo: "skills", label: "Anthropic Skills" },
  { owner: "supabase", repo: "agent-skills", label: "Supabase Agent Skills" },
  { owner: "prisma", repo: "skills", label: "Prisma Skills" },
  { owner: "microsoft", repo: "azure-skills", label: "Microsoft Azure Skills" },
  { owner: "remotion-dev", repo: "skills", label: "Remotion Skills" },
  { owner: "expo", repo: "skills", label: "Expo Skills" },
  { owner: "mattpocock", repo: "skills", label: "Matt Pocock Skills" },
];
