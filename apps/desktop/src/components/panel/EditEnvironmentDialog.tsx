import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Folder, Loader2, Plus, X } from "lucide-react";
import { BranchPicker, useBranches } from "@/components/kode/BranchPicker";
import { getEnvironment, saveEnvironment, type EnvVariable } from "@/lib/kode-environments";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";
import { ScopedSettingsPanel, type ScopeTarget } from "./ScopedSettingsPanel";
import { environmentSettings, loadProjectSettings, saveProjectSettings, type ScopedSettings } from "@/lib/kode-scoped-settings";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Edit environment (like Claude Code): name, folder + branch/worktree, variables. */
export function EditEnvironmentDialog({
  projectName,
  projectPath,
  onClose,
}: {
  projectName: string | null;
  projectPath: string;
  onClose: () => void;
}) {
  const { newChat, ensureFolder } = useKodeWorkspace();
  const saved = getEnvironment(projectPath);
  const [name, setName] = useState(saved.name ?? projectName ?? "");
  const [variables, setVariables] = useState<EnvVariable[]>(saved.variables);
  const [varsOpen, setVarsOpen] = useState(false);
  const [worktree, setWorktree] = useState(false);
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoped, setScoped] = useState<ScopedSettings>(() => environmentSettings(projectPath));
  const [scopeTarget, setScopeTarget] = useState<ScopeTarget>("environment");
  useEffect(() => {
    // Prefer showing the project file when it has settings and this Mac has none.
    if (Object.keys(environmentSettings(projectPath)).length > 0) return;
    void loadProjectSettings(projectPath).then((fromFile) => {
      if (Object.keys(fromFile).length > 0) {
        setScoped(fromFile);
        setScopeTarget("project");
      }
    });
  }, [projectPath]);
  const { branches, reload } = useBranches(projectPath);
  const folderName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const badName = variables.find((v) => v.name.trim() && !NAME_RE.test(v.name.trim()));

  const save = async () => {
    if (badName) {
      setError(`"${badName.name}" isn't a valid variable name. Use letters, digits and _.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cleaned = variables.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), value: v.value }));
      if (scopeTarget === "project") await saveProjectSettings(projectPath, scoped);
      const env = { name: name.trim() || undefined, variables: cleaned, settings: scopeTarget === "environment" ? scoped : {} };
      saveEnvironment(projectPath, env);
      if (worktree) {
        if (!worktreeBranch.trim()) throw new Error("Enter a branch name for the worktree.");
        const path = await invoke<string>("panel_git_worktree_add", { root: projectPath, branch: worktreeBranch.trim() });
        // The worktree is its own folder; carry the same environment over.
        saveEnvironment(path, env);
        newChat(ensureFolder(path));
      }
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md animate-in fade-in duration-150 dark:bg-black/70"
      onClick={() => !saving && onClose()}
    >
      <div className="liquid-glass-dropdown w-full max-w-lg p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Edit environment</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.06]"
          >
            <X size={15} />
          </button>
        </div>

        <label className="mb-1.5 block text-[12.5px] font-medium text-foreground/85">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="kontinue-3d mb-5 h-9 w-full rounded-full px-4 text-[13px] outline-none"
        />

        <p className="mb-1.5 text-[12.5px] font-medium text-foreground/85">Folder</p>
        <div className="kontinue-3d mb-3 rounded-[16px] px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <Folder size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[13px]">{folderName}</span>
            <BranchPicker root={projectPath} repoName={folderName} side="bottom" align="end" onChanged={() => void reload()}>
              <button
                type="button"
                className="flex h-7 cursor-pointer items-center gap-1 rounded-full px-2 font-mono text-[12px] text-foreground/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              >
                {branches?.current ?? "branch"}
                <span className="font-sans text-muted-foreground">Current</span>
                <ChevronDown size={12} className="text-muted-foreground" />
              </button>
            </BranchPicker>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={worktree}
                onChange={(e) => setWorktree(e.target.checked)}
                className="size-3.5 accent-purple-500"
              />
              Worktree
            </label>
          </div>
          {worktree ? (
            <div className="mt-2.5 pl-6">
              <input
                value={worktreeBranch}
                onChange={(e) => setWorktreeBranch(e.target.value)}
                placeholder="Branch for the new worktree"
                className="kontinue-3d h-8 w-full rounded-full px-3 text-[12px] outline-none placeholder:text-muted-foreground/60"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Creates a separate folder on that branch and moves this session there.
              </p>
            </div>
          ) : null}
        </div>

        <div className="kontinue-3d rounded-[16px]">
          <button
            type="button"
            onClick={() => setVarsOpen((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Environment variables</span>
              <span className="block text-[11.5px] text-muted-foreground">
                {variables.filter((v) => v.name.trim()).length === 0
                  ? "None for this environment"
                  : `${variables.filter((v) => v.name.trim()).length} set · used by the terminal and agent commands`}
              </span>
            </span>
            <ChevronRight size={14} className={cn("shrink-0 text-muted-foreground transition-transform", varsOpen && "rotate-90")} />
          </button>
          {varsOpen ? (
            <div className="space-y-1.5 border-t border-black/[0.06] px-3 py-3 dark:border-white/[0.06]">
              {variables.map((variable, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <input
                    value={variable.name}
                    onChange={(e) =>
                      setVariables((list) => list.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)))
                    }
                    placeholder="NAME"
                    spellCheck={false}
                    className={cn(
                      "h-8 w-[40%] rounded-full bg-black/[0.04] px-3 font-mono text-[12px] outline-none dark:bg-white/[0.05]",
                      variable.name.trim() && !NAME_RE.test(variable.name.trim()) && "ring-1 ring-rose-500/60",
                    )}
                  />
                  <span className="text-muted-foreground">=</span>
                  <input
                    value={variable.value}
                    onChange={(e) =>
                      setVariables((list) => list.map((v, i) => (i === index ? { ...v, value: e.target.value } : v)))
                    }
                    placeholder="value"
                    spellCheck={false}
                    className="h-8 min-w-0 flex-1 rounded-full bg-black/[0.04] px-3 font-mono text-[12px] outline-none dark:bg-white/[0.05]"
                  />
                  <button
                    type="button"
                    aria-label="Remove variable"
                    onClick={() => setVariables((list) => list.filter((_, i) => i !== index))}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-rose-400"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setVariables((list) => [...list, { name: "", value: "" }])}
                className="flex cursor-pointer items-center gap-1.5 px-1 pt-1 text-[12px] font-medium text-purple-500 hover:underline"
              >
                <Plus size={12} /> Add variable
              </button>
              <p className="px-1 text-[10.5px] text-muted-foreground">
                Stored on this Mac. PATH, HOME and other system variables can't be overridden.
              </p>
            </div>
          ) : null}
        </div>

        <ScopedSettingsPanel value={scoped} onChange={setScoped} target={scopeTarget} onTargetChange={setScopeTarget} />

        {error ? <p className="mt-3 text-[12px] text-rose-400">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="kontinue-3d h-9 cursor-pointer rounded-full px-4 text-[13px] text-foreground/85"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="kontinue-3d-primary flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
