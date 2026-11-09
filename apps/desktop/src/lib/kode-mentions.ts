// The `@` file picker: browse the project one folder at a time (root first),
// or type to search every file.
//
//   ""          → root folders and files
//   "src/"      → what's inside src
//   "src/app"   → inside src, names matching "app"
//   "button"    → root matches, then matching files anywhere

export type MentionEntry = {
  /** Path relative to the project root (folders have no trailing slash). */
  path: string;
  name: string;
  isDir: boolean;
  /** Parent folder, shown under deep search results. */
  parent: string | null;
};

const MAX = 40;

function childrenOf(files: string[], dir: string): MentionEntry[] {
  const prefix = dir ? `${dir}/` : "";
  const folders = new Set<string>();
  const entries: MentionEntry[] = [];
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash >= 0) {
      const name = rest.slice(0, slash);
      if (!folders.has(name)) {
        folders.add(name);
        entries.push({ path: `${prefix}${name}`, name, isDir: true, parent: dir || null });
      }
    } else if (rest) {
      entries.push({ path: file, name: rest, isDir: false, parent: dir || null });
    }
  }
  return entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

function rank(entries: MentionEntry[], term: string): MentionEntry[] {
  if (!term) return entries;
  const t = term.toLowerCase();
  const starts = entries.filter((e) => e.name.toLowerCase().startsWith(t));
  const contains = entries.filter((e) => !e.name.toLowerCase().startsWith(t) && e.name.toLowerCase().includes(t));
  return [...starts, ...contains];
}

export function mentionEntries(files: string[], query: string): MentionEntry[] {
  const slash = query.lastIndexOf("/");
  if (slash >= 0) {
    const dir = query.slice(0, slash).replace(/^\/+|\/+$/g, "");
    return rank(childrenOf(files, dir), query.slice(slash + 1)).slice(0, MAX);
  }
  const root = rank(childrenOf(files, ""), query);
  if (!query) return root.slice(0, MAX);
  // Typing a name also finds matching files deeper in the tree.
  const seen = new Set(root.map((e) => e.path));
  const t = query.toLowerCase();
  const deep = files
    .filter((file) => !seen.has(file) && (file.split("/").pop() ?? file).toLowerCase().includes(t))
    .map((file) => {
      const cut = file.lastIndexOf("/");
      return {
        path: file,
        name: file.slice(cut + 1),
        isDir: false,
        parent: cut >= 0 ? file.slice(0, cut) : null,
      };
    });
  return [...root, ...rank(deep, query)].slice(0, MAX);
}
