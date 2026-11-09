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
  const branch = await repoDefaultBranch(owner, repo);
  const tree = await repoTree(owner, repo, branch);
  const dirs = [...new Set(
    tree
      .filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
      .map((p) => (p === "SKILL.md" ? "" : p.slice(0, -"/SKILL.md".length))),
  )];

  const listings: SkillListing[] = [];
  for (const dir of dirs.slice(0, 60)) {
    const path = dir ? `${dir}/SKILL.md` : "SKILL.md";
    try {
      const raw = await fetchText(rawUrl(owner, repo, branch, path));
      const { frontmatter } = parseSkillMarkdown(raw);
      listings.push({
        name: typeof frontmatter.name === "string" ? frontmatter.name : (dir.split("/").pop() ?? repo),
        path: dir,
        description: typeof frontmatter.description === "string" ? frontmatter.description : undefined,
        license: typeof frontmatter.license === "string" ? frontmatter.license : undefined,
      });
    } catch {
      listings.push({ name: dir.split("/").pop() ?? repo, path: dir });
    }
  }
  return listings;
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
  const branch = await repoDefaultBranch(owner, repo);
  const tree = await repoTree(owner, repo, branch);
  const prefix = skillDir ? `${skillDir}/` : "";

  const files: SkillBundleFile[] = [];
  for (const path of tree) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    if (!rel || BINARY_EXT.test(rel)) continue;
    try {
      files.push({ path: rel, content: await fetchText(rawUrl(owner, repo, branch, path)) });
    } catch {
      // skip unreadable file
    }
  }

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

export type RepoResult = {
  full_name: string;
  description?: string;
  stars: number;
  html_url: string;
};

/** Search GitHub for repositories (public API, no auth). */
export async function searchRepos(q: string): Promise<RepoResult[]> {
  try {
    const data = await fetchJson(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=20`,
    );
    const items = data.items;
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
      const repo = item as Record<string, unknown>;
      return {
        full_name: String(repo.full_name ?? ""),
        description: typeof repo.description === "string" ? repo.description : undefined,
        stars: typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0,
        html_url: String(repo.html_url ?? ""),
      };
    });
  } catch {
    return [];
  }
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
