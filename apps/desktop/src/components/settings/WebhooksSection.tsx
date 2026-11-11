// Settings → Webhooks: secret URLs that start a Kode thread when something
// happens (GitHub / GitLab events, CI failures, alerts, any POST).

import { Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Filter, Folder, KeyRound, Loader2, Plus, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@/components/ui/switch";
import { webhooksApi, type KodeWebhook, type KodeWebhookFilters, type KodeWebhookKind } from "@/lib/convex-api";
import { webhookUrl } from "@/lib/kode-webhooks";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { formatActivity } from "@/lib/kode-import";
import { cn } from "@/lib/utils";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;

const KINDS: { id: KodeWebhookKind; label: string; hint: string }[] = [
  { id: "ci", label: "CI failures", hint: "Failed GitHub workflow runs or checks, failed GitLab pipelines" },
  { id: "pull_request", label: "Pull requests", hint: "Opened, reopened, ready for review or updated" },
  { id: "review", label: "Changes requested", hint: "A review that asks for changes" },
  { id: "issue", label: "Issues", hint: "Opened, reopened or labeled" },
  { id: "comment", label: "Comments", hint: "New comments on issues and pull requests" },
  { id: "push", label: "Pushes", hint: "Commits pushed to a branch" },
  { id: "other", label: "Other events", hint: "Anything else, including services that aren't GitHub or GitLab" },
];

const splitList = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export function WebhooksSection() {
  const hooks = useQuery(webhooksApi.kodeWebhooks.listWebhooks, {});
  const create = useMutation(webhooksApi.kodeWebhooks.createWebhook);
  const { folders } = useKodeWorkspace();
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const folder = folders.find((f) => f.path === folderPath);
      await create({
        name: name.trim() || "Webhook",
        projectPath: folder?.path,
        projectName: folder?.name,
        instructions: instructions.trim() || undefined,
      });
      setName("");
      setInstructions("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const input = "kontinue-3d h-9 w-full rounded-full bg-transparent px-4 text-body outline-none placeholder:text-muted-foreground/60";
  return (
    <div className="space-y-4">
      <p className="px-1 text-label text-muted-foreground">
        Point GitHub, GitLab, your CI or any service at a webhook URL. Each event opens a thread in the chosen project and asks Kode to handle it. Events wait until one of your devices with that project is open. New webhooks only accept signed deliveries: paste the webhook's secret into GitHub or GitLab.
      </p>

      <section className="liquid-glass-dropdown space-y-2.5 !rounded-[20px] px-4 py-4">
        <p className="text-body font-medium">New webhook</p>
        <p className="text-caption text-muted-foreground">Signing is on by default. Set filters and copy the secret from the webhook once it's created.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. CI failures)" className={input} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(input, "flex cursor-pointer items-center gap-2 text-left")}>
              <Folder size={13} className="shrink-0 text-purple-500" />
              <span className="min-w-0 flex-1 truncate">{folders.find((f) => f.path === folderPath)?.name ?? "No project (thread without files)"}</span>
              <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            {folders.map((folder) => (
              <DropdownMenuItem key={folder.id} onSelect={() => setFolderPath(folder.path)}>
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                {folder.path === folderPath ? <Check size={13} className="shrink-0" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => setFolderPath("")}>
              <span className="flex-1">No project (thread without files)</span>
              {!folderPath ? <Check size={13} className="shrink-0" /> : null}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="What should Kode do? (optional, e.g. Fix the failing test and open a PR)" className="kontinue-3d w-full resize-none rounded-2xl bg-transparent px-4 py-2 text-body outline-none placeholder:text-muted-foreground/60" />
        {error ? <p className="text-label text-rose-400">{error}</p> : null}
        <button type="button" onClick={() => void add()} disabled={busy} className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium disabled:opacity-60">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create webhook
        </button>
      </section>

      {hooks === undefined ? (
        <p className="px-1 text-label text-muted-foreground">Loading…</p>
      ) : hooks.length === 0 ? (
        <p className="px-1 text-label text-muted-foreground">No webhooks yet.</p>
      ) : (
        hooks.map((hook) => <WebhookRow key={hook.id} hook={hook} />)
      )}
    </div>
  );
}

function WebhookRow({ hook }: { hook: KodeWebhook }) {
  const update = useMutation(webhooksApi.kodeWebhooks.updateWebhook);
  const remove = useMutation(webhooksApi.kodeWebhooks.deleteWebhook);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = webhookUrl(CONVEX_URL, hook.token);
  const copy = () =>
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  const iconButton = "flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground";
  return (
    <section className="liquid-glass-dropdown space-y-2 !rounded-[20px] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-body font-medium">{hook.name}</p>
        <span className="text-caption text-muted-foreground">
          {hook.projectName ?? "No project"} · {hook.lastEventAt ? `last event ${formatActivity(hook.lastEventAt)}` : "no events yet"}
        </span>
        <Switch checked={hook.enabled} onCheckedChange={(enabled) => void update({ id: hook.id, enabled })} aria-label={`Turn ${hook.name} on or off`} />
      </div>
      <div className="flex items-center gap-1 rounded-full bg-black/[0.04] py-1 pr-1 pl-3 dark:bg-white/[0.05]">
        <code className="min-w-0 flex-1 truncate text-caption text-foreground/75">{url}</code>
        <button type="button" onClick={copy} aria-label="Copy URL" title="Copy URL" className={iconButton}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button type="button" onClick={() => void update({ id: hook.id, rotateToken: true })} aria-label="New URL" title="Make a new URL (the old one stops working)" className={iconButton}>
          <RotateCw size={13} />
        </button>
        <button
          type="button"
          onClick={() => (confirmDelete ? void remove({ id: hook.id }) : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
          aria-label="Delete webhook"
          title={confirmDelete ? "Click again to delete" : "Delete"}
          className={cn(iconButton, confirmDelete && "text-rose-500")}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {hook.instructions ? <p className="text-label text-muted-foreground">{hook.instructions}</p> : null}
      <SigningRow hook={hook} />
      <FiltersRow hook={hook} />
      <p className="text-caption text-muted-foreground/80">
        GitHub: Settings → Webhooks → Payload URL, content type application/json, and paste the secret into Secret. GitLab:
        Settings → Webhooks → URL, and paste the secret into Secret token. Other services can sign like GitHub with an
        X-Kode-Signature header.
      </p>
    </section>
  );
}

function SigningRow({ hook }: { hook: KodeWebhook }) {
  const update = useMutation(webhooksApi.kodeWebhooks.updateWebhook);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const iconButton = "kontinue-hover flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground";
  const copy = () =>
    hook.signingSecret &&
    void navigator.clipboard.writeText(hook.signingSecret).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div className="space-y-2 rounded-2xl border border-black/[0.05] px-3 py-2.5 dark:border-white/[0.06]">
      <div className="flex items-center gap-2">
        <ShieldCheck size={13} className={hook.requireSignature ? "shrink-0 text-emerald-500" : "shrink-0 text-amber-500"} />
        <div className="min-w-0 flex-1">
          <p className="text-label font-medium text-foreground/90">Only accept signed deliveries</p>
          <p className="text-caption text-muted-foreground">
            {hook.requireSignature
              ? "Deliveries without this webhook's signature are rejected."
              : "Anyone with the URL can start a thread. Turn on for GitHub and GitLab."}
          </p>
        </div>
        <Switch
          checked={hook.requireSignature}
          onCheckedChange={(requireSignature) => void update({ id: hook.id, requireSignature })}
          aria-label="Only accept signed deliveries"
        />
      </div>
      {hook.signingSecret ? (
        <div className="flex items-center gap-1 rounded-full bg-black/[0.04] py-1 pr-1 pl-3 dark:bg-white/[0.05]">
          <KeyRound size={12} className="shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate pl-1 text-caption text-foreground/75">
            {shown ? hook.signingSecret : "•".repeat(32)}
          </code>
          <button type="button" onClick={() => setShown((v) => !v)} title={shown ? "Hide secret" : "Show secret"} className={iconButton}>
            {shown ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button type="button" onClick={copy} title="Copy secret" className={iconButton}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={() => void update({ id: hook.id, rotateSecret: true })}
            title="Make a new secret (update it in GitHub or GitLab too)"
            className={iconButton}
          >
            <RotateCw size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FiltersRow({ hook }: { hook: KodeWebhook }) {
  const update = useMutation(webhooksApi.kodeWebhooks.updateWebhook);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState(hook.filters.branches.join(", "));
  const [authors, setAuthors] = useState(hook.filters.authors.join(", "));
  const save = (filters: Partial<KodeWebhookFilters>) => void update({ id: hook.id, filters: { ...hook.filters, ...filters } });
  const kinds = hook.filters.kinds;
  const active = kinds.length + hook.filters.branches.length + hook.filters.authors.length > 0;
  const summary = [
    kinds.length ? KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.label).join(", ") : "All events",
    hook.filters.branches.length ? `on ${hook.filters.branches.join(", ")}` : null,
    hook.filters.authors.length ? `by ${hook.filters.authors.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const toggleKind = (id: KodeWebhookKind) =>
    save({ kinds: kinds.includes(id) ? kinds.filter((k) => k !== id) : [...kinds, id] });
  const field = "kontinue-3d h-8 w-full rounded-full bg-transparent px-3.5 text-label outline-none placeholder:text-muted-foreground/60";
  return (
    <div className="rounded-2xl border border-black/[0.05] dark:border-white/[0.06]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="kontinue-hover flex h-8 w-full cursor-pointer items-center gap-2 rounded-2xl px-3 text-left">
        <Filter size={12} className={active ? "shrink-0 text-purple-500" : "shrink-0 text-muted-foreground"} />
        <span className="shrink-0 text-label font-medium text-foreground/90">Filters</span>
        <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{summary}</span>
        <ChevronRight size={12} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="space-y-3 px-3 pb-3">
          <div>
            <p className="mb-1.5 text-caption text-muted-foreground">React to (none selected = all)</p>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((kind) => {
                const on = kinds.includes(kind.id);
                return (
                  <button
                    key={kind.id}
                    type="button"
                    title={kind.hint}
                    onClick={() => toggleKind(kind.id)}
                    className={cn(
                      "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label",
                      on ? "kontinue-capsule text-foreground" : "kontinue-3d text-foreground/75 hover:text-foreground",
                    )}
                  >
                    {on ? <Check size={11} /> : null}
                    {kind.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-caption text-muted-foreground">Branches (e.g. main, release/*). Events without a branch, like issues, still pass.</span>
            <input
              value={branches}
              onChange={(e) => setBranches(e.target.value)}
              onBlur={() => save({ branches: splitList(branches) })}
              placeholder="Any branch"
              spellCheck={false}
              className={cn(field, "font-mono")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-caption text-muted-foreground">
              Only from these GitHub or GitLab users. Recommended for public repos, where anyone can open an issue.
            </span>
            <input
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              onBlur={() => save({ authors: splitList(authors) })}
              placeholder="Anyone"
              spellCheck={false}
              className={cn(field, "font-mono")}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
