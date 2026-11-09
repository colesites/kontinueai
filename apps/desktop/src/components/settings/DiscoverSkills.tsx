import { useState } from "react";
import {
  Check,
  Download,
  FileArchive,
  FileText,
  Folder,
  GitBranch,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  CURATED_REPOS,
  analyzeSkill,
  commitSkillInstall,
  fetchGithubSkillFiles,
  fetchLocalSkill,
  fetchZipSkill,
  listRepoSkills,
  parseRepoRef,
  searchRepos,
  type RepoResult,
  type SkillAnalysis,
  type SkillBundle,
  type SkillListing,
} from "@/lib/kode-marketplace";
import { cn } from "@/lib/utils";

type PendingInstall = { bundle: SkillBundle; analysis: SkillAnalysis };

export function DiscoverSkills({
  installedNames,
  onInstalled,
}: {
  installedNames: Set<string>;
  onInstalled: () => void;
}) {
  const [query, setQuery] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [repos, setRepos] = useState<RepoResult[]>([]);
  const [listings, setListings] = useState<SkillListing[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInstall | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setRepos(await searchRepos(q));
      setListings([]);
      setRepo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const browseRepo = async (input: string) => {
    const ref = parseRepoRef(input);
    if (!ref) {
      setError("Enter a GitHub repo like owner/repo (or a full URL).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const found = await listRepoSkills(ref.owner, ref.repo);
      setListings(found);
      setRepo(`${ref.owner}/${ref.repo}`);
      setRepos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Fetch + inspect, then show a confirmation before writing to disk.
  const inspect = async (listing: SkillListing) => {
    if (!repo) return;
    const ref = parseRepoRef(repo);
    if (!ref) return;
    setInstalling(listing.name);
    setError(null);
    try {
      const bundle = await fetchGithubSkillFiles(ref.owner, ref.repo, listing.path);
      setPending({ bundle, analysis: analyzeSkill(bundle) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
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

  return (
    <div className="space-y-5">
      {/* Search GitHub repositories */}
      <form onSubmit={(e) => void runSearch(e)} className="flex items-center gap-2">
        <div className="kontinue-3d flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-3">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GitHub for skill repositories…"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <button type="submit" disabled={searching || query.trim().length < 2} className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium disabled:opacity-50">
          {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Search
        </button>
      </form>

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
            placeholder="GitHub repo — e.g. anthropics/skills"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <button type="submit" disabled={busy || !repoInput.trim()} className="kontinue-3d flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] text-foreground/85 hover:text-foreground disabled:opacity-50">
          Browse
        </button>
      </form>

      {/* Curated repos */}
      <div>
        <p className="mb-1.5 px-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Popular libraries</p>
        <div className="flex flex-wrap gap-1.5">
          {CURATED_REPOS.map((r) => (
            <button
              key={`${r.owner}/${r.repo}`}
              type="button"
              onClick={() => void browseRepo(`${r.owner}/${r.repo}`)}
              className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] text-foreground/80 hover:text-foreground"
            >
              <Sparkles size={11} className="text-purple-400" />
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Import from disk */}
      <div>
        <p className="mb-1.5 px-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Import</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void importLocal()}
            disabled={installing !== null}
            className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] text-foreground/80 hover:text-foreground disabled:opacity-50"
          >
            {installing === "import-local" ? <Loader2 size={12} className="animate-spin" /> : <Folder size={12} />}
            Import folder
          </button>
          <button
            type="button"
            onClick={() => void importZip()}
            disabled={installing !== null}
            className="kontinue-3d flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] text-foreground/80 hover:text-foreground disabled:opacity-50"
          >
            {installing === "import-zip" ? <Loader2 size={12} className="animate-spin" /> : <FileArchive size={12} />}
            Import ZIP
          </button>
        </div>
      </div>

      {error ? <p className="px-1 text-[12px] text-rose-400">{error}</p> : null}

      {/* Repo search results */}
      {repos.length > 0 ? (
        <div>
          <h3 className="mb-2 px-1 text-[12px] font-medium text-foreground/80">Repositories</h3>
          <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
            {repos.map((r) => (
              <button
                key={r.full_name}
                type="button"
                onClick={() => void browseRepo(r.full_name)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12.5px] font-medium text-foreground/90">{r.full_name}</p>
                  {r.description ? <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{r.description}</p> : null}
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Star size={12} className="text-amber-400" />
                  {r.stars.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Skills in the browsed repo */}
      {repo ? (
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="font-mono text-[12px] font-medium text-foreground/80">{repo}</h3>
            <span className="text-[11px] text-muted-foreground">{listings.length} skill{listings.length === 1 ? "" : "s"}</span>
          </div>
          <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
            {listings.length === 0 && !busy ? (
              <p className="px-4 py-3 text-[12px] text-muted-foreground">No skills found in this repo.</p>
            ) : null}
            {listings.map((listing) => {
              const installed = installedNames.has(listing.name);
              const isInstalling = installing === listing.name;
              return (
                <div key={listing.name} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-foreground/90">
                      <span className="truncate">{listing.name}</span>
                      {listing.license ? (
                        <span className="shrink-0 rounded-full border border-black/10 px-1.5 py-px text-[9.5px] text-muted-foreground dark:border-white/10">
                          {listing.license}
                        </span>
                      ) : null}
                    </p>
                    {listing.description ? <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{listing.description}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void inspect(listing)}
                    disabled={installed || isInstalling}
                    className={cn(
                      "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium disabled:cursor-default",
                      installed ? "text-emerald-500" : "kontinue-3d-primary",
                    )}
                  >
                    {isInstalling ? <Loader2 size={12} className="animate-spin" /> : installed ? <Check size={13} /> : <Download size={13} />}
                    {installed ? "Installed" : "Install"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Install confirmation + security inspection */}
      {pending ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6">
          <div className="liquid-glass-dropdown w-full max-w-md !rounded-[20px] p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">{pending.bundle.name}</h3>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{pending.bundle.source}</p>
              </div>
              <button type="button" onClick={() => setPending(null)} className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>

            {pending.analysis.description ? (
              <p className="mb-3 text-[12.5px] leading-relaxed text-foreground/80">{pending.analysis.description}</p>
            ) : null}

            <div className="mb-3 flex items-center gap-3 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1"><FileText size={12} /> {pending.analysis.fileCount} files</span>
              {pending.analysis.license ? <span>License: {pending.analysis.license}</span> : null}
            </div>

            {pending.analysis.scripts.length > 0 ? (
              <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                  <ShieldAlert size={14} /> This skill contains scripts
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-amber-700/80 dark:text-amber-300/80">
                  Scripts are never run automatically during install, but review them before use:
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {pending.analysis.scripts.slice(0, 8).map((s) => (
                    <li key={s} className="truncate font-mono text-[11px] text-amber-700/80 dark:text-amber-300/80">{s}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11.5px] text-emerald-600 dark:text-emerald-400">
                <Check size={13} /> No scripts or executables detected.
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} className="kontinue-3d flex h-8 cursor-pointer items-center rounded-full px-4 text-[12px] text-foreground/85 hover:text-foreground">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmInstall()}
                disabled={installing !== null}
                className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[12px] font-medium disabled:opacity-50"
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
