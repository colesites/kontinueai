import { DismissOnEscape } from "@/components/ui/dismiss-on-escape";
// Moving a project to another machine: the sender dialog (project menu →
// "Move to another machine") and the receiving card on the Kode home screen.

import { ArrowRightLeft, FolderInput, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useConvex } from "convex/react";
import { projectMovesApi, type ProjectBundle } from "@/lib/convex-api";
import { deviceId } from "@/lib/kode-webhooks";
import { formatActivity } from "@/lib/kode-import";
import { useKodeWorkspace } from "@/lib/kode-workspace";

type Incoming = Awaited<ReturnType<typeof listMoves>>[number];

function listMoves(convex: ReturnType<typeof useConvex>) {
  return convex.query(projectMovesApi.kodeProjectMoves.listProjectMoves, {});
}

const errorText = (error: unknown) => (typeof error === "string" ? error : error instanceof Error ? error.message : String(error));

export function MoveProjectDialog({ project, chatIds, onClose }: { project: { name: string; path: string }; chatIds: string[]; onClose: () => void }) {
  const convex = useConvex();
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    invoke<ProjectBundle>("kode_project_bundle", { root: project.path }).then(setBundle, (e) => setError(errorText(e)));
  }, [project.path]);

  const send = async () => {
    if (!bundle) return;
    setSending(true);
    setError(null);
    try {
      const fromDevice = await invoke<string>("kode_device_name").catch(() => "another computer");
      await convex.mutation(projectMovesApi.kodeProjectMoves.sendProjectMove, {
        name: bundle.name,
        remoteUrl: bundle.remoteUrl ?? undefined,
        branch: bundle.branch ?? undefined,
        headSha: bundle.headSha ?? undefined,
        headPushed: bundle.headPushed,
        patch: bundle.patch,
        changedFiles: bundle.changedFiles,
        chatIds,
        fromDevice,
      });
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center kontinue-scrim p-4" role="dialog" aria-modal="true">
      <DismissOnEscape onClose={onClose} />
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="liquid-glass-dropdown relative z-10 w-full max-w-[440px] space-y-3 p-5 text-foreground">
        <div className="flex items-center justify-between">
          <h2 className="text-lead font-semibold">Move {project.name} to another machine</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        {sent ? (
          <p className="text-body text-foreground/80">Sent. Open Kode on the other machine: the Kode home screen offers to set {project.name} up there, with its {chatIds.length} chat{chatIds.length === 1 ? "" : "s"}.</p>
        ) : !bundle && !error ? (
          <p className="flex items-center gap-2 text-label text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Checking the project…
          </p>
        ) : bundle ? (
          <ul className="space-y-1 text-label text-foreground/80">
            <li>Branch: {bundle.branch ?? "detached"}{bundle.remoteUrl ? "" : " · no git remote"}</li>
            <li>Uncommitted changes: {bundle.changedFiles.length === 0 ? "none" : `${bundle.changedFiles.length} file${bundle.changedFiles.length === 1 ? "" : "s"} (sent as a patch; ignored files stay here)`}</li>
            <li>Chats: {chatIds.length}</li>
            {!bundle.remoteUrl ? <li className="text-amber-600 dark:text-amber-400">With no remote, the other machine needs an existing copy of the repo.</li> : null}
            {bundle.remoteUrl && !bundle.headPushed ? <li className="text-amber-600 dark:text-amber-400">Your latest commits aren't pushed. Push them first, or the other machine gets the branch as it is on the remote.</li> : null}
          </ul>
        ) : null}
        {error ? <p className="text-label text-rose-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="kontinue-3d h-8 cursor-pointer rounded-full px-3.5 text-label">
            {sent ? "Done" : "Cancel"}
          </button>
          {!sent ? (
            <button type="button" onClick={() => void send()} disabled={!bundle || sending} className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium disabled:cursor-default disabled:opacity-60">
              {sending ? <Loader2 size={12} className="animate-spin" /> : <ArrowRightLeft size={12} />}
              Send
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Kode home: projects sent from your other machines, ready to set up here. */
export function IncomingProjectMoves() {
  const convex = useConvex();
  const { ensureFolder, assignChatsToFolder, newChat } = useKodeWorkspace();
  const [moves, setMoves] = useState<Incoming[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listMoves(convex).then(setMoves, () => setMoves([]));
  }, [convex]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setUp = async (move: Incoming) => {
    const picked = await openDialog({ directory: true, multiple: false, title: `Where should ${move.name} go? Pick an existing checkout or a parent folder.` });
    if (typeof picked !== "string") return;
    setBusy(move.id);
    setMessage(null);
    let claimed = false;
    try {
      const isRepo = await invoke<boolean>("kode_path_exists", { path: `${picked}/.git` }).catch(() => false);
      const target = isRepo || picked.split(/[\\/]/).pop() === move.name ? picked : `${picked.replace(/[\\/]+$/, "")}/${move.name}`;
      const bundle = await convex.mutation(projectMovesApi.kodeProjectMoves.claimProjectMove, { id: move.id, deviceId: deviceId() });
      if (!bundle) {
        setMessage("Another machine already set this project up.");
        refresh();
        return;
      }
      claimed = true;
      const result = await invoke<{ path: string; cloned: boolean; warnings: string[] }>("kode_project_restore", { target, bundle });
      const folderId = ensureFolder(result.path);
      assignChatsToFolder(bundle.chatIds, folderId);
      setMessage(
        `${move.name} is set up at ${result.path}${result.warnings.length ? `. ${result.warnings.join(" ")}` : "."}`,
      );
      newChat(folderId);
      refresh();
    } catch (e) {
      if (claimed) await convex.mutation(projectMovesApi.kodeProjectMoves.releaseProjectMove, { id: move.id }).catch(() => {});
      setMessage(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (move: Incoming) => {
    await convex.mutation(projectMovesApi.kodeProjectMoves.releaseProjectMove, { id: move.id, cancel: true }).catch(() => {});
    refresh();
  };

  if (moves.length === 0 && !message) return null;
  return (
    <div className="mx-auto w-full max-w-md space-y-2 text-left">
      {moves.map((move) => (
        <div key={move.id} className="kontinue-3d flex items-center gap-3 rounded-[18px] px-3.5 py-2.5">
          <FolderInput size={15} className="shrink-0 text-purple-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium">{move.name} from {move.fromDevice}</p>
            <p className="truncate text-caption text-muted-foreground">
              {move.branch ?? "no branch"} · {move.changedFiles} uncommitted · {move.chats} chat{move.chats === 1 ? "" : "s"} · {formatActivity(move.createdAt)}
            </p>
          </div>
          <button type="button" onClick={() => void setUp(move)} disabled={busy !== null} className="kontinue-3d-primary flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-label font-medium disabled:opacity-60">
            {busy === move.id ? <Loader2 size={11} className="animate-spin" /> : null}
            Set up here
          </button>
          <button type="button" onClick={() => void dismiss(move)} aria-label="Dismiss" title="Dismiss" className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        </div>
      ))}
      {message ? <p className="px-2 text-label text-muted-foreground">{message}</p> : null}
    </div>
  );
}
