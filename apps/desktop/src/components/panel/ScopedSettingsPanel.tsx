// "Kode settings for this folder" in the Edit environment dialog: override the
// global defaults for one project, either for this machine (environment) or
// in .kode/settings.json so the team gets them too (project).

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { KODE_MODELS } from "@repo/ai/lib/kode";
import { cn } from "@/lib/utils";
import type { ScopedSettings } from "@/lib/kode-scoped-settings";

export type ScopeTarget = "environment" | "project";

const MODE_OPTIONS = [
  ["supervised", "Supervised"],
  ["auto_edits", "Auto edits"],
  ["auto", "Auto"],
  ["full_access", "Full access"],
  ["plan", "Plan"],
] as const;
const EFFORT_OPTIONS = ["off", "low", "medium", "high", "xhigh", "max"] as const;

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="kontinue-3d h-8 max-w-[55%] cursor-pointer rounded-full bg-transparent px-3 text-[12px] text-foreground outline-none">
      <option value="">Use global</option>
      {options.map(([id, label]) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function ScopedSettingsPanel({
  value,
  onChange,
  target,
  onTargetChange,
}: {
  value: ScopedSettings;
  onChange: (value: ScopedSettings) => void;
  target: ScopeTarget;
  onTargetChange: (target: ScopeTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = Object.keys(value).length;
  const set = <K extends keyof ScopedSettings>(key: K, raw: string, parse: (raw: string) => ScopedSettings[K]) => {
    const next = { ...value };
    if (raw === "") delete next[key];
    else next[key] = parse(raw);
    onChange(next);
  };
  const row = "flex items-center justify-between gap-3 py-1.5 text-[12.5px]";
  return (
    <div className="kontinue-3d mt-3 rounded-[16px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">Kode settings for this folder</span>
          <span className="block text-[11.5px] text-muted-foreground">{count === 0 ? "Same as Settings" : `${count} override${count === 1 ? "" : "s"} · ${target === "project" ? "in .kode/settings.json" : "on this Mac"}`}</span>
        </span>
        <ChevronRight size={14} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="border-t border-black/[0.06] px-4 py-2 dark:border-white/[0.06]">
          <div className={row}>
            <span>Model for new sessions</span>
            <Select value={value.defaultKodeModel ?? ""} onChange={(raw) => set("defaultKodeModel", raw, (v) => v)} options={KODE_MODELS.map((m) => [m.id, m.name] as const)} />
          </div>
          <div className={row}>
            <span>Permission mode</span>
            <Select value={value.defaultKodeMode ?? ""} onChange={(raw) => set("defaultKodeMode", raw, (v) => v as ScopedSettings["defaultKodeMode"])} options={MODE_OPTIONS} />
          </div>
          <div className={row}>
            <span>Reasoning</span>
            <Select value={value.kodeReasoning ?? ""} onChange={(raw) => set("kodeReasoning", raw, (v) => v as ScopedSettings["kodeReasoning"])} options={EFFORT_OPTIONS.map((e) => [e, e === "off" ? "Off" : e[0].toUpperCase() + e.slice(1)] as const)} />
          </div>
          <div className={row}>
            <span>Fast mode</span>
            <Select value={value.kodeFastMode === undefined ? "" : String(value.kodeFastMode)} onChange={(raw) => set("kodeFastMode", raw, (v) => v === "true")} options={[["true", "On"], ["false", "Off"]]} />
          </div>
          <div className={row}>
            <span>Enter sends</span>
            <Select value={value.sendOnEnter === undefined ? "" : String(value.sendOnEnter)} onChange={(raw) => set("sendOnEnter", raw, (v) => v === "true")} options={[["true", "Enter"], ["false", "⌘ Enter"]]} />
          </div>
          <div className="mt-2 flex items-center gap-1 rounded-full bg-black/[0.04] p-0.5 text-[11.5px] dark:bg-white/[0.05]">
            {(["environment", "project"] as const).map((option) => (
              <button key={option} type="button" onClick={() => onTargetChange(option)} className={cn("flex-1 cursor-pointer rounded-full px-3 py-1", target === option ? "kontinue-3d text-foreground" : "text-muted-foreground")}>
                {option === "environment" ? "Only on this Mac" : "In the project (.kode/settings.json)"}
              </button>
            ))}
          </div>
          <p className="px-1 pt-1.5 pb-1 text-[10.5px] text-muted-foreground">Project settings can be committed so everyone on the repo gets them. Settings on this Mac win over the project's.</p>
        </div>
      ) : null}
    </div>
  );
}
