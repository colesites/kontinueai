// Skill schema for the Kode AI Skills System.
//
// A "skill" is a markdown file (SKILL.md) with YAML-style frontmatter. The
// frontmatter is machine-routable metadata; the body is model-readable guidance
// that gets injected into the system prompt when the skill is selected.
//
// This mirrors the Anthropic / Vercel agent-skills convention so skills authored
// for those ecosystems are portable into Kode.

export type SkillFrontmatter = {
  /** kebab-case unique id, also the folder name. */
  name: string;
  /** One line the router matches against to decide relevance. */
  description: string;
  /**
   * Framework/tech tags. When the repo profile reports one of these, the skill
   * is boosted. Empty = always-applicable (e.g. clean-architecture, debugging).
   */
  appliesTo: string[];
  /** Optional semver-ish version of the guidance. */
  version?: string;
  /** Official docs this skill defers to (used for citations / RAG seeding). */
  docs?: string[];
};

export type Skill = SkillFrontmatter & {
  /** The full markdown body (everything after the frontmatter). */
  body: string;
};

/**
 * Minimal, dependency-free frontmatter parser. Supports the subset we use:
 *   key: value
 *   key: [a, b, c]
 * Anything else in the body is returned untouched. We deliberately avoid adding
 * a YAML dependency for something this constrained.
 */
export function parseSkillMarkdown(raw: string): Skill {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("SKILL.md is missing required frontmatter block");
  }
  const [, frontmatterBlock, body] = match;
  const fields: Record<string, string | string[]> = {};

  for (const line of (frontmatterBlock ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      fields[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      fields[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  const name = fields.name;
  const description = fields.description;
  if (typeof name !== "string" || typeof description !== "string") {
    throw new Error("SKILL.md frontmatter requires 'name' and 'description'");
  }

  return {
    name,
    description,
    appliesTo: Array.isArray(fields.appliesTo) ? fields.appliesTo : [],
    version: typeof fields.version === "string" ? fields.version : undefined,
    docs: Array.isArray(fields.docs) ? fields.docs : [],
    body: (body ?? "").trim(),
  };
}
