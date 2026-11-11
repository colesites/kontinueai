import { DismissOnEscape } from "@/components/ui/dismiss-on-escape";
// "Snapshot into a new thread": counts down so you can switch to the app you
// want, captures the screen and its accessibility tree, then starts a Kode
// thread with your question and the snapshot.

import { Camera, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { KODE_MODEL_ID } from "@repo/ai/lib/kode";
import { captureSnapshot, shrinkImage, snapshotPrompt, type Snapshot } from "@/lib/kode-snapshot";
import { schedulePrompt } from "@/lib/kode-schedule";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { useAppSettings } from "@/lib/app-settings";

export function SnapshotDialog({ projectId, projectPath, onClose }: { projectId: string | null; projectPath: string | null; onClose: () => void }) {
  const { createKodeChatRecord, selectChat } = useKodeWorkspace();
  // Settings → Snapshots.
  const { snapshotDelay, snapshotIncludeTree, snapshotSaveImage, snapshotModel, snapshotMode } = useAppSettings();
  const delayMs = Math.max(0, snapshotDelay) * 1000;
  const [countdown, setCountdown] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = async (delay: number) => {
    setError(null);
    setSnapshot(null);
    setCountdown(Math.ceil(delay / 1000));
    try {
      setSnapshot(await captureSnapshot(delay));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCountdown(null);
    }
  };

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const start = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      let saved: string | null = null;
      if (snapshotSaveImage && snapshot.image && projectPath) {
        saved = await invoke<string>("kode_save_attachment", { root: projectPath, filename: "snapshot.png", data: snapshot.image }).catch(() => null);
      }
      const where = snapshot.app ?? "screen";
      const chatId = await createKodeChatRecord({ title: `Snapshot: ${ask.trim().slice(0, 40) || where}`, projectId });
      const url = snapshot.image ? await shrinkImage(snapshot.image).catch(() => null) : null;
      schedulePrompt({
        chatId,
        chatTitle: null,
        text: snapshotPrompt(snapshotIncludeTree ? snapshot : { ...snapshot, tree: "" }, ask, saved),
        modelId: snapshotModel ?? KODE_MODEL_ID,
        mode: snapshotMode,
        attachments: url ? [{ id: `snap-${snapshot.takenAt}`, type: "file", mediaType: "image/jpeg", filename: "snapshot.jpg", url }] : undefined,
        fireAt: Date.now(),
        reason: "manual",
      });
      selectChat(chatId);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center kontinue-scrim p-4" role="dialog" aria-modal="true">
      <DismissOnEscape onClose={onClose} />
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="liquid-glass-dropdown relative z-10 w-full max-w-[480px] space-y-3 p-4 text-foreground">
        <div className="flex items-center justify-between">
          <h2 className="text-lead font-semibold">Snapshot into a new thread</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <p className="text-label text-muted-foreground">Captures the screen and the front app's accessibility tree (buttons, fields, labels) as text. macOS asks for Screen Recording and Accessibility access the first time.</p>

        {snapshot?.image ? <img src={`data:image/png;base64,${snapshot.image}`} alt="Snapshot" className="max-h-56 w-full rounded-2xl border border-black/[0.07] object-contain dark:border-white/[0.08]" /> : null}
        {snapshot ? (
          <p className="text-caption text-muted-foreground">
            {[snapshot.app, snapshot.window].filter(Boolean).join(" · ") || "Screen"} · {snapshot.tree.split("\n").filter(Boolean).length} elements
            {snapshot.notes.map((note) => (
              <span key={note} className="block text-amber-600 dark:text-amber-400">{note}</span>
            ))}
          </p>
        ) : null}

        <textarea value={ask} onChange={(event) => setAsk(event.target.value)} rows={2} placeholder="What should the agent do with it?" className="kontinue-3d w-full resize-none rounded-2xl bg-transparent px-3 py-2 text-body outline-none placeholder:text-muted-foreground/60" />
        {error ? <p className="text-caption text-red-500">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => void capture(delayMs)} disabled={countdown !== null || busy} className="kontinue-3d flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label disabled:opacity-60">
            {countdown !== null ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            {countdown !== null ? (countdown > 0 ? `Switch apps… ${countdown}` : "Capturing…") : snapshot ? "Retake" : delayMs ? `Capture in ${snapshotDelay}s` : "Capture now"}
          </button>
          <button type="button" onClick={() => void start()} disabled={!snapshot || busy} className="kontinue-3d-primary flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium disabled:cursor-default disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Start thread
          </button>
        </div>
      </div>
    </div>
  );
}
