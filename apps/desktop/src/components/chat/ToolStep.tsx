import { ChevronRight, FilePen, FilePlus, FileText, FolderOpen, Globe, Loader2, MessageCircleQuestion, Search, Sparkles, Terminal, Trash2, Wrench, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { KodeToolStep } from "@/lib/kode-agent";
import { cn } from "@/lib/utils";

function shellCommand(step: KodeToolStep) {
  if (typeof step.args.command === "string" && step.args.command.trim()) {
    return step.args.command.trim();
  }
  if (step.description.startsWith("Run:")) {
    return step.description.slice(4).trim();
  }
  return null;
}

type StepStatus = "running" | "done" | "error" | "rejected";

function stepStatus(step: KodeToolStep): StepStatus {
  if (step.state === "running") return "running";
  if (step.state === "error") return "error";
  if (step.state === "rejected") return "rejected";
  return "done";
}

/** Plural, past-tense summary for a run of the same tool call. */
const GROUP_LABELS: Record<string, (n: number) => string> = {
  read_file: (n) => `Read ${n} file${n === 1 ? "" : "s"}`,
  list_dir: (n) => `Listed ${n} folder${n === 1 ? "" : "s"}`,
  write_file: (n) => `Wrote ${n} file${n === 1 ? "" : "s"}`,
  edit_file: (n) => `Edited ${n} file${n === 1 ? "" : "s"}`,
  delete_file: (n) => `Deleted ${n} item${n === 1 ? "" : "s"}`,
  run_command: (n) => `Ran ${n} command${n === 1 ? "" : "s"}`,
  web_search: (n) => `Searched the web ${n} time${n === 1 ? "" : "s"}`,
  fetch_url: (n) => `Read ${n} page${n === 1 ? "" : "s"}`,
  load_skill: (n) => `Loaded ${n} skill${n === 1 ? "" : "s"}`,
  search_docs: (n) => `Searched docs ${n} time${n === 1 ? "" : "s"}`,
};

/** Icon for a tool row, by what the tool does. */
function toolIcon(name: string): LucideIcon {
  if (/read|view/.test(name)) return FileText;
  if (/edit|patch|str_replace/.test(name)) return FilePen;
  if (/write|create/.test(name)) return FilePlus;
  if (/delete|remove/.test(name)) return Trash2;
  if (/list|dir|glob/.test(name)) return FolderOpen;
  if (/search|grep|find/.test(name)) return Search;
  if (/fetch|web|url|browse/.test(name)) return Globe;
  if (/skill/.test(name)) return Sparkles;
  if (/command|bash|shell|exec/.test(name)) return Terminal;
  return Wrench;
}

const OUTPUT_BOX =
  "mt-1 ml-5 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-[11.5px] leading-5 text-foreground/65 dark:bg-white/[0.05]";

export function CommandBlock({ command, status, result }: { command: string; status?: StepStatus; result?: string }) {
  const [open, setOpen] = useState(false);
  const preview = command.split("\n")[0] ?? command;

  return (
    <div className="my-0.5">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full cursor-pointer items-center gap-1.5 text-left text-[12.5px] text-foreground/55 hover:text-foreground/80">
        {status === "running" ? <Loader2 className="size-3 shrink-0 animate-spin" /> : <Terminal className="size-3 shrink-0" />}
        <span className="truncate font-mono text-[11.5px]">{preview}</span>
        {status === "error" ? <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 text-[10.5px] text-red-500 dark:text-red-400">failed</span> : null}
        <ChevronRight size={12} className={cn("shrink-0 opacity-50 transition-transform", open && "rotate-90")} />
      </button>
      {open ? <pre className={OUTPUT_BOX}>{result ? `$ ${command}\n\n${result}` : `$ ${command}`}</pre> : null}
    </div>
  );
}

export function ToolStepView({ step }: { step: KodeToolStep; onApprove?: (id: string) => void; onReject?: (id: string) => void; onOptions?: (id: string, values: string[]) => void }) {
  const command = shellCommand(step);

  if (step.state === "pending-options" || step.state === "pending-approval") return null;

  const status = stepStatus(step);

  // A question you answered: show the question and your answer on one line.
  if (step.name === "ask_options" && step.result) {
    const answer = step.result.replace(/^User selected:\s*/, "").replace(/^User did not select anything\.?$/, "no answer");
    return (
      <div className="my-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-foreground/50">
        <MessageCircleQuestion size={12} className="shrink-0" />
        <span className="min-w-0 truncate">{step.description.replace(/`/g, "")}</span>
        <span className="shrink-0 text-foreground/80">→ {answer}</span>
      </div>
    );
  }

  if (command) {
    return <CommandBlock command={command} result={step.result} status={status} />;
  }

  return <ResultBlock name={step.name} description={step.description} result={step.result} status={status} />;
}

/** Non-command tools (read / write / edit / search…): collapse into a single
 *  row and expand to reveal the result, matching the reference clients. */
function ResultBlock({ name, description, result, status }: { name: string; description: string; result?: string; status: StepStatus }) {
  const Icon = toolIcon(name);
  const [open, setOpen] = useState(false);
  const detail = typeof result === "string" && result.trim() ? result : null;
  const expandable = Boolean(detail);

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => expandable && setOpen((current) => !current)}
        disabled={!expandable}
        className={cn(
          "flex w-full items-center gap-1.5 text-left text-[12.5px] text-foreground/50",
          expandable ? "cursor-pointer hover:text-foreground/75" : "cursor-default",
        )}
      >
        {status === "running" ? <Loader2 className="size-3 shrink-0 animate-spin" /> : <Icon className="size-3 shrink-0" />}
        <span className="truncate">
          {status === "running" ? "Working · " : ""}
          {description}
        </span>
        {/* A failed read or search is usually harmless (a guessed path), so
            it gets a small label rather than turning the whole row red. */}
        {status === "error" ? <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 text-[10.5px] text-red-500 dark:text-red-400">failed</span> : null}
        {expandable ? <ChevronRight size={12} className={cn("shrink-0 opacity-50 transition-transform", open && "rotate-90")} /> : null}
      </button>
      {open && detail ? <pre className={OUTPUT_BOX}>{detail}</pre> : null}
    </div>
  );
}

/** A run of consecutive identical tool calls collapses into one counted row. */
function ToolStepGroup({ steps }: { steps: KodeToolStep[] }) {
  const [open, setOpen] = useState(false);
  const name = steps[0].name;
  const label = GROUP_LABELS[name]?.(steps.length) ?? `${name} × ${steps.length}`;
  const GroupIcon = toolIcon(name);

  return (
    <div className="my-0.5">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full cursor-pointer items-center gap-1.5 text-left text-[12.5px] text-foreground/55 hover:text-foreground/80">
        <GroupIcon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronRight size={12} className={cn("shrink-0 opacity-50 transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="mt-0.5 border-l border-black/[0.06] pl-4 dark:border-white/[0.08]">
          {steps.map((step) => (
            <ToolStepView key={step.id} step={step} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Renders a list of tool steps, collapsing consecutive same-tool calls. */
export function ToolStepList({ steps }: { steps: KodeToolStep[] }) {
  const groups: KodeToolStep[][] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    const canGroup = last && last[0].name === step.name && last[0].state === "done" && step.state === "done";
    if (canGroup) {
      last.push(step);
    } else {
      groups.push([step]);
    }
  }

  return (
    <>
      {groups.map((group) =>
        group.length > 1 ? (
          <ToolStepGroup key={group[0].id} steps={group} />
        ) : (
          <ToolStepView key={group[0].id} step={group[0]} />
        ),
      )}
    </>
  );
}
