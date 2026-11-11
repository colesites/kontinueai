// "Check for Updates…" and the quiet launch check (lib/updater.ts).

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { CircleCheck, Loader2 } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { closeUpdateDialog, installUpdate, restartToUpdate, startUpdateChecks, useUpdater } from "@/lib/updater";

const secondary =
  "kontinue-3d flex h-8 cursor-pointer items-center rounded-full px-4 text-label text-foreground/85 hover:text-foreground";
const primary = "kontinue-3d-primary flex h-8 cursor-pointer items-center rounded-full px-4 text-label font-medium";

export function UpdateDialog() {
  const { state, open } = useUpdater();
  const [current, setCurrent] = useState("");

  useEffect(() => {
    startUpdateChecks();
    void getVersion().then(setCurrent).catch(() => {});
  }, []);

  const title =
    state.status === "available" || state.status === "downloading"
      ? `Kontinue AI ${state.version} is available`
      : state.status === "ready"
        ? "Ready to update"
        : state.status === "error"
          ? "Couldn't check for updates"
          : "Software update";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : closeUpdateDialog())}>
      <DialogContent size="sm" title={title} description={current ? `You have version ${current}.` : undefined}>
        <DialogBody>
          {state.status === "checking" || state.status === "idle" ? (
            <p className="flex items-center gap-2 text-body text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Checking for updates…
            </p>
          ) : state.status === "current" ? (
            <p className="flex items-center gap-2 text-body text-muted-foreground">
              <CircleCheck size={15} className="text-emerald-500" /> You're up to date.
            </p>
          ) : state.status === "available" ? (
            state.notes ? (
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-label leading-relaxed text-muted-foreground">
                {state.notes}
              </div>
            ) : (
              <p className="text-body text-muted-foreground">A new version is ready to download.</p>
            )
          ) : state.status === "downloading" ? (
            <div className="space-y-2">
              <p className="text-label text-muted-foreground">
                Downloading{state.progress !== null ? ` · ${Math.round(state.progress * 100)}%` : "…"}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-purple-500 transition-[width] duration-300"
                  style={{ width: `${Math.round((state.progress ?? 0.1) * 100)}%` }}
                />
              </div>
            </div>
          ) : state.status === "ready" ? (
            <p className="text-body text-muted-foreground">
              Version {state.version} is installed. Restart Kontinue AI to start using it. Running agents will stop.
            </p>
          ) : (
            <p className="text-body text-muted-foreground">{state.message}</p>
          )}
        </DialogBody>
        <DialogFooter>
          {state.status === "available" ? (
            <>
              <button type="button" onClick={closeUpdateDialog} className={secondary}>
                Later
              </button>
              <button type="button" onClick={() => void installUpdate()} className={primary}>
                Download and install
              </button>
            </>
          ) : state.status === "ready" ? (
            <>
              <button type="button" onClick={closeUpdateDialog} className={secondary}>
                Later
              </button>
              <button type="button" onClick={() => void restartToUpdate()} className={primary}>
                Restart now
              </button>
            </>
          ) : state.status === "downloading" ? (
            <button type="button" onClick={closeUpdateDialog} className={secondary}>
              Hide
            </button>
          ) : (
            <button type="button" onClick={closeUpdateDialog} className={primary}>
              OK
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
