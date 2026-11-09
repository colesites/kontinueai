// Skill schema for the open Agent Skills format (Claude Code / Codex compatible).
//
// A skill is a directory containing a `SKILL.md` with YAML frontmatter and a
// markdown body, plus optional supporting resources:
//
//   my-skill/
//     SKILL.md
//     scripts/
//     references/
//     assets/
//
// The frontmatter is machine-read metadata; the body is model-readable guidance.
// We parse a dependency-free subset of YAML (inline scalars, block scalars,
// lists, and one level of nested mapping) that covers the fields real skills
// ship with today.

export type SkillMetadata = Record<string, string>;

export type SkillFrontmatter = {
  /** kebab-case unique id, also the folder name. */
  name: string;
  /** One line (or short block) the router matches to decide relevance. */
  description: string;
  /** SPDX identifier or prose license, when the author declares one. */
  license?: string;
  /** Frameworks/tools this skill is compatible with (string or list). */
  compatibility?: string | string[];
  /** Tools the skill is allowed to use (e.g. ["Read", "Bash"]). */
  allowedTools?: string[];
  /** Free-form author/version/other metadata. */
  metadata?: SkillMetadata;
  /** Optional semver-ish version. */
  version?: string;
};

export type Skill = SkillFrontmatter & {
  /** The full markdown body (everything after the frontmatter). */
  body: string;
};

export type SkillValidation =
  | { ok: true; skill: Skill }
  | { ok: false; errors: string[] };

/** Parse `raw` SKILL.md content into frontmatter + body. Throws on malformed input. */
export function parseSkillMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("SKILL.md is missing a '---' frontmatter block");
  }
  return { frontmatter: parseFrontmatter(match[1] ?? ""), body: (match[2] ?? "").trim() };
}

/** Validate parsed frontmatter + body into a typed Skill, or collect errors. */
export function validateSkill(frontmatter: Record<string, unknown>, body: string): SkillValidation {
  const errors: string[] = [];
  const name = asString(frontmatter.name);
  const description = asString(frontmatter.description);

  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    errors.push("frontmatter 'name' is required and must be kebab-case (lowercase letters, digits, dashes)");
  }
  if (!description) {
    errors.push("frontmatter 'description' is required");
  }
  if (!body) {
    errors.push("SKILL.md body is empty");
  }

  if (errors.length > 0) return { ok: false, errors };

  const skill: Skill = {
    name: name as string,
    description: description as string,
    license: asString(frontmatter.license),
    compatibility: asStringOrList(frontmatter.compatibility),
    allowedTools: asList(frontmatter["allowed-tools"]) ?? asList(frontmatter.allowedTools),
    metadata: asMetadata(frontmatter.metadata),
    version: asString(frontmatter.version),
    body,
  };
  return { ok: true, skill };
}

// ─── Dependency-free YAML-subset parsing ────────────────────────────────────

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function asStringOrList(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return undefined;
}

function asList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length > 0 ? items : undefined;
}

function asMetadata(value: unknown): SkillMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: SkillMetadata = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const text = asString(val);
    if (text) out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseScalar(raw: string): string | string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      i += 1;
      continue;
    }
    const key = keyMatch[1] ?? "";
    const inline = keyMatch[2] ?? "";

    // Block scalar (`key: |` / `key: >`) — text.
    if (inline === "|" || inline === ">") {
      const children = collectChildren(lines, i);
      result[key] = children.map((c) => c.trim()).join("\n").trim();
      i = nextIndex(lines, i);
      continue;
    }

    // Empty inline → nested mapping, list, or folded scalar.
    if (inline.trim() === "") {
      const children = collectChildren(lines, i);
      i = nextIndex(lines, i);
      const trimmed = children.filter((c) => c.trim() !== "");
      if (trimmed.length === 0) {
        result[key] = "";
      } else if (trimmed.every((c) => /^\s*-\s+/.test(c))) {
        result[key] = trimmed.map((c) => c.trim().replace(/^-\s+/, "").replace(/^["']|["']$/g, "").trim());
      } else if (trimmed.every((c) => /^\s*[A-Za-z0-9_-]+:\s*/.test(c))) {
        result[key] = parseFrontmatter(trimmed.map((c) => c.trim()).join("\n"));
      } else {
        result[key] = trimmed.map((c) => c.trim()).join("\n").trim();
      }
      continue;
    }

    result[key] = parseScalar(inline);
    i += 1;
  }

  return result;
}

/** Lines indented more than the parent line, until the next non-indented line. */
function collectChildren(lines: string[], parentIndex: number): string[] {
  const children: string[] = [];
  let j = parentIndex + 1;
  while (j < lines.length) {
    const line = lines[j] ?? "";
    if (line.trim() === "") {
      // Skip blank lines inside the block (don't include them).
      j += 1;
      continue;
    }
    if (!/^\s+/.test(line)) break;
    children.push(line);
    j += 1;
  }
  return children;
}

function nextIndex(lines: string[], parentIndex: number): number {
  let j = parentIndex + 1;
  while (j < lines.length) {
    const line = lines[j] ?? "";
    if (line.trim() === "" || /^\s+/.test(line)) {
      j += 1;
      continue;
    }
    break;
  }
  return j;
}
