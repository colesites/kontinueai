// Settings → Webhooks: secret URLs that start a Kode thread when something
// happens (GitHub / GitLab events, CI failures, alerts, any POST).

import { Check, ChevronDown, Copy, Folder, Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Switch } from "@/components/ui/switch";
import { webhooksApi, type KodeWebhook } from "@/lib/convex-api";
import { webhookUrl } from "@/lib/kode-webhooks";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { formatActivity } from "@/lib/kode-import";
import { cn } from "@/lib/utils";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;

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

  const input = "kontinue-3d h-9 w-full rounded-full bg-transparent px-4 text-[12.5px] outline-none placeholder:text-muted-foreground/60";
  return (
    <div className="space-y-4">
      <p className="px-1 text-[11.5px] text-muted-foreground">
        Point GitHub, GitLab, your CI or any service at a webhook URL. Each event opens a thread in the chosen project and asks Kode to handle it. Events wait until one of your devices with that project is open.
      </p>

      <section className="liquid-glass-dropdown space-y-2.5 !rounded-[20px] px-4 py-4">
        <p className="text-[13px] font-medium">New webhook</p>
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
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="What should Kode do? (optional, e.g. Fix the failing test and open a PR)" className="kontinue-3d w-full resize-none rounded-2xl bg-transparent px-4 py-2 text-[12.5px] outline-none placeholder:text-muted-foreground/60" />
        {error ? <p className="text-[11.5px] text-rose-400">{error}</p> : null}
        <button type="button" onClick={() => void add()} disabled={busy} className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium disabled:opacity-60">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create webhook
        </button>
      </section>

      {hooks === undefined ? (
        <p className="px-1 text-[12px] text-muted-foreground">Loading…</p>
      ) : hooks.length === 0 ? (
        <p className="px-1 text-[12px] text-muted-foreground">No webhooks yet.</p>
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
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{hook.name}</p>
        <span className="text-[11px] text-muted-foreground">
          {hook.projectName ?? "No project"} · {hook.lastEventAt ? `last event ${formatActivity(hook.lastEventAt)}` : "no events yet"}
        </span>
        <Switch checked={hook.enabled} onCheckedChange={(enabled) => void update({ id: hook.id, enabled })} aria-label={`Turn ${hook.name} on or off`} />
      </div>
      <div className="flex items-center gap-1 rounded-full bg-black/[0.04] py-1 pr-1 pl-3 dark:bg-white/[0.05]">
        <code className="min-w-0 flex-1 truncate text-[11px] text-foreground/75">{url}</code>
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
      {hook.instructions ? <p className="text-[11.5px] text-muted-foreground">{hook.instructions}</p> : null}
      <p className="text-[10.5px] text-muted-foreground/80">Keep this URL private: anyone with it can start a thread. GitHub: Settings → Webhooks → Payload URL, content type application/json.</p>
    </section>
  );
}
