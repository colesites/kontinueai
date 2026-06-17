// Node/server-side skill router. Loads skills from disk (registry) and scores
// them with the pure selector in ./select. Browser/Tauri consumers should import
// ./select directly and supply their own skills array (see kode-ide kode-skills).

import { loadSkills } from "./registry";
import { selectFromSkills, type RepoProfile } from "./select";

export { buildSkillsContext, buildRepoContext } from "./select";
export type { RepoProfile } from "./select";

export function selectSkills(
  query: string,
  repo: RepoProfile = {},
  limit = 3,
) {
  return selectFromSkills(query, repo, loadSkills(), limit);
}
