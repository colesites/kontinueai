import { DismissOnEscape } from "@/components/ui/dismiss-on-escape";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Folder,
  GitBranch,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import {
  CURATED_REPOS,
  analyzeSkill,
  commitSkillInstall,
  fetchGithubSkillFiles,
  fetchLocalSkill,
  fetchZipSkill,
  findSkillDir,
  listRepoSkills,
  parseRepoRef,
  searchSkillsSh,
  type SkillAnalysis,
  type SkillBundle,
  type SkillListing,
  type SkillsShResult,
} from "@/lib/kode-marketplace";
import { cn } from "@/lib/utils";

type PendingInstall = { bundle: SkillBundle; analysis: SkillAnalysis };

const formatInstalls = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K` : String(n);

export function DiscoverSkills({
  installedNames,
  onInstalled,
}: {
  installedNames: Set<string>;
  onInstalled: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillsShResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [listings, setListings] = useState<SkillListing[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  /** Repo being loaded ("owner/repo"), for its spinner. */
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInstall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchId = useRef(0);

  // Search skills.sh as you type.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const id = ++searchId.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchSkillsSh(q)
        .then((found) => {
          if (id === searchId.current) {
            setResults(found);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (id === searchId.current) setError(`skills.sh search failed: ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => {
          if (id === searchId.current) setSearching(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const browseRepo = async (input: string) => {
    const ref = parseRepoRef(input);
    if (!ref) {
      setError("Enter a GitHub repo like owner/repo (or a full URL).");
      return;
    }
    const name = `${ref.owner}/${ref.repo}`;
    setLoadingRepo(name);
    setError(null);
    try {
      const found = await listRepoSkills(ref.owner, ref.repo);
      setListings(found);
      setRepo(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingRepo(null);
    }
  };

  // Fetch + inspect, then show a confirmation before writing to disk.
  const inspectAt = async (key: string, owner: string, repoName: string, dir: () => Promise<string>) => {
    setInstalling(key);
    setError(null);
    try {
      const bundle = await fetchGithubSkillFiles(owner, repoName, await dir());
      setPending({ bundle, analysis: analyzeSkill(bundle) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
  };

  const inspectListing = (listing: SkillListing) => {
    const ref = repo ? parseRepoRef(repo) : null;
    if (ref) void inspectAt(listing.name, ref.owner, ref.repo, async () => listing.path);
  };

  const inspectResult = (skill: SkillsShResult) => {
    const ref = parseRepoRef(skill.source);
    if (ref) void inspectAt(skill.id, ref.owner, ref.repo, () => findSkillDir(ref.owner, ref.repo, skill.skillId));
  };

  const inspectBundle = (bundle: SkillBundle) => {
    setPending({ bundle, analysis: analyzeSkill(bundle) });
  };

  const importLocal = async () => {
    setInstalling("import-local");
    setError(null);
    try {
      inspectBundle(await fetchLocalSkill());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "Import cancelled") setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const importZip = async () => {
    setInstalling("import-zip");
    setError(null);
    try {
      inspectBundle(await fetchZipSkill());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "Import cancelled") setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const confirmInstall = async () => {
    if (!pending) return;
    setInstalling(pending.bundle.name);
    setError(null);
    try {
      await commitSkillInstall(pending.bundle);
      setPending(null);
      onInstalled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
  };

  const installButton = (installed: boolean, busy: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={installed || busy || installing !== null}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label font-medium disabled:cursor-default",
        installed ? "text-emerald-500" : "kontinue-3d-primary disabled:opacity-60",
      )}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : installed ? <Check size={13} /> : <Download size={13} />}
      {installed ? "Installed" : busy ? "Loading…" : "Install"}
    </button>
  );

  const showingSearch = query.trim().length >= 2;

  return (
    <div className="space-y-5">
      {/* Search skills.sh */}
      <div className="kontinue-3d flex h-9 items-center gap-2 rounded-full px-3.5">
        {searching ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search size={13} className="shrink-0 text-muted-foreground" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills on skills.sh…"
          spellCheck={false}
          className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground/50"
        />
        {query ? (
          <button
            type="button"
            title="Clear"
            onClick={() => setQuery("")}
            className="kontinue-hover flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {error ? <p className="px-1 text-label text-rose-400">{error}</p> : null}

      {showingSearch ? (
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-label font-medium text-foreground/80">Results from skills.sh</h3>
            <button
              type="button"
              onClick={() => void openUrl(`https://skills.sh/?q=${encodeURIComponent(query.trim())}`)}
              className="flex cursor-pointer items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
            >
              Open skills.sh <ExternalLink size={10} />
            </button>
          </div>
          <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
            {results === null ? (
              <p className="flex items-center gap-2 px-4 py-3 text-label text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="px-4 py-3 text-label text-muted-foreground">No skills match "{query.trim()}".</p>
            ) : (
              results.map((skill) => (
                <div key={skill.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-foreground/90">{skill.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-label text-muted-foreground">
                      <span className="truncate font-mono">{skill.source}</span>
                      <span className="shrink-0 tabular-nums">· {formatInstalls(skill.installs)} installs</span>
                    </p>
                  </div>
                  {installButton(installedNames.has(skill.skillId) || installedNames.has(skill.name), installing === skill.id, () =>
                    inspectResult(skill),
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Curated collections */}
          <div>
            <p className="mb-1.5 px-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">Popular libraries</p>
            <p className="mb-2 px-1 text-label text-muted-foreground">Browse every skill in a well-known collection.</p>
            <div className="flex flex-wrap gap-1.5">
              {CURATED_REPOS.map((r) => {
                const name = `${r.owner}/${r.repo}`;
                const loading = loadingRepo === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    disabled={loadingRepo !== null}
                    onClick={() => void browseRepo(name)}
                    className={cn(
                      "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label disabled:cursor-default",
                      repo === name ? "kontinue-capsule text-foreground" : "kontinue-3d text-foreground/80 hover:text-foreground",
                      loadingRepo !== null && !loading && "opacity-50",
                    )}
                  >
                    {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} className="text-purple-400" />}
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browse a repo directly */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void browseRepo(repoInput);
            }}
            className="flex items-center gap-2"
          >
            <div className="kontinue-3d flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3">
              <GitBranch size={13} className="shrink-0 text-muted-foreground" />
              <input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Or open a GitHub repo, e.g. anthropics/skills"
                className="w-full bg-transparent text-body outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <button
              type="submit"
              disabled={loadingRepo !== null || !repoInput.trim()}
              className="kontinue-3d flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label text-foreground/85 hover:text-foreground disabled:opacity-50"
            >
              {loadingRepo && !CURATED_REPOS.some((r) => `${r.owner}/${r.repo}` === loadingRepo) ? (
                <Loader2 size={12} className="animate-spin" />
              ) : null}
              Open
            </button>
          </form>

          {/* Skills in the opened repo */}
          {loadingRepo ? (
            <p className="flex items-center gap-2 px-1 text-label text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Loading skills from {loadingRepo}…
            </p>
          ) : repo ? (
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="font-mono text-label font-medium text-foreground/80">{repo}</h3>
                <span className="text-caption text-muted-foreground">
                  {listings.length} skill{listings.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
                {listings.length === 0 ? (
                  <p className="px-4 py-3 text-label text-muted-foreground">No skills found in this repo.</p>
                ) : null}
                {listings.map((listing) => (
                  <div key={listing.path || listing.name} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-body font-medium text-foreground/90">
                        <span className="truncate">{listing.name}</span>
                        {listing.license ? (
                          <span className="shrink-0 rounded-full border border-black/10 px-1.5 py-px text-micro text-muted-foreground dark:border-white/10">
                            {listing.license}
                          </span>
                        ) : null}
                      </p>
                      {listing.description ? (
                        <p title={listing.description} className="mt-0.5 line-clamp-2 text-label text-muted-foreground">
                          {listing.description}
                        </p>
                      ) : null}
                    </div>
                    {installButton(installedNames.has(listing.name), installing === listing.name, () => inspectListing(listing))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Import from disk */}
          <div>
            <p className="mb-1.5 px-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">Import</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void importLocal()}
                disabled={installing !== null}
                className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label text-foreground/80 hover:text-foreground disabled:opacity-50"
              >
                {installing === "import-local" ? <Loader2 size={12} className="animate-spin" /> : <Folder size={12} />}
                Import folder
              </button>
              <button
                type="button"
                onClick={() => void importZip()}
                disabled={installing !== null}
                className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label text-foreground/80 hover:text-foreground disabled:opacity-50"
              >
                {installing === "import-zip" ? <Loader2 size={12} className="animate-spin" /> : <FileArchive size={12} />}
                Import ZIP
              </button>
            </div>
          </div>
        </>
      )}

      {/* Install confirmation + security inspection */}
      {pending ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center kontinue-scrim p-6" role="dialog" aria-modal="true">
          <DismissOnEscape onClose={() => setPending(null)} />
          <div className="liquid-glass-dropdown w-full max-w-md !rounded-[20px] p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">{pending.bundle.name}</h3>
                <p className="mt-0.5 font-mono text-caption text-muted-foreground">{pending.bundle.source}</p>
              </div>
              <button type="button" onClick={() => setPending(null)} className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>

            {pending.analysis.description ? (
              <p className="mb-3 text-body leading-relaxed text-foreground/80">{pending.analysis.description}</p>
            ) : null}

            <div className="mb-3 flex items-center gap-3 text-label text-muted-foreground">
              <span className="flex items-center gap-1"><FileText size={12} /> {pending.analysis.fileCount} files</span>
              {pending.analysis.license ? <span>License: {pending.analysis.license}</span> : null}
            </div>

            {pending.analysis.scripts.length > 0 ? (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-1.5 text-label font-medium text-amber-600 dark:text-amber-400">
                  <ShieldAlert size={14} /> This skill contains scripts
                </p>
                <p className="mt-1 text-label leading-relaxed text-amber-700/80 dark:text-amber-300/80">
                  Scripts are never run automatically during install, but review them before use:
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {pending.analysis.scripts.slice(0, 8).map((s) => (
                    <li key={s} className="truncate font-mono text-caption text-amber-700/80 dark:text-amber-300/80">{s}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-label text-emerald-600 dark:text-emerald-400">
                <Check size={13} /> No scripts or executables detected.
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} className="kontinue-3d flex h-8 cursor-pointer items-center rounded-full px-4 text-label text-foreground/85 hover:text-foreground">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmInstall()}
                disabled={installing !== null}
                className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-4 text-label font-medium disabled:opacity-50"
              >
                {installing === pending.bundle.name ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Install
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
