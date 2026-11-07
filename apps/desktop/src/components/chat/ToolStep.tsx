import { Check, Copy, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import type { KodeToolStep } from "@/lib/kode-agent";
import { cn } from "@/lib/utils";

type OptionItemArg = { value: string; label: string; description?: string };

function shellCommand(step: KodeToolStep) {
  if (typeof step.args.command === "string" && step.args.command.trim()) {
    return step.args.command.trim();
  }
  if (step.description.startsWith("Run:")) {
    return step.description.slice(4).trim();
  }
  return null;
}

export function CommandBlock({ command, status }: { command: string; status?: "running" | "done" | "error" | "rejected" }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const lines = command.split("\n");
  const preview = lines[0] ?? command;
  const rest = lines.slice(1).join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable.
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start gap-2 px-3 py-2.5">
        {status === "running" ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-foreground/45" /> : status === "error" || status === "rejected" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400/80" /> : null}
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12.5px] leading-5 text-foreground/80">{open ? command : preview}</pre>
        <button type="button" onClick={() => void copy()} title="Copy" aria-label="Copy" className="flex size-6 shrink-0 items-center justify-center rounded-md text-foreground/40 hover:text-foreground">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      {rest && !open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full border-t border-black/8 px-3 py-1 text-left text-[11px] text-foreground/40 hover:text-foreground/70 dark:border-white/8">
          Show the rest
        </button>
      ) : null}
    </div>
  );
}

export function ToolStepView({ step, onApprove, onReject, onOptions }: { step: KodeToolStep; onApprove: (id: string) => void; onReject: (id: string) => void; onOptions: (id: string, values: string[]) => void }) {
  const [open, setOpen] = useState(step.state === "error");
  const command = shellCommand(step);

  if (step.state === "pending-options") {
    const question = typeof step.args.question === "string" ? step.args.question : step.description;
    const rawOptions = Array.isArray(step.args.options) ? (step.args.options as OptionItemArg[]) : [];

    return (
      <div className="my-3">
        <p className="text-[14.5px] leading-relaxed text-foreground">{question}</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {rawOptions.map((opt) => (
            <button key={opt.value} type="button" onClick={() => onOptions(step.id, [opt.value])} className="rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-left text-[13px] text-foreground/90 hover:bg-black/[0.05] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
              <span className="block">{opt.label}</span>
              {opt.description ? <span className="mt-0.5 block text-[12px] text-foreground/45">{opt.description}</span> : null}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step.state === "pending-approval") {
    return (
      <div className="my-3">
        <CommandBlock command={command ?? step.description} />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => onApprove(step.id)} className="h-8 rounded-full bg-foreground px-3.5 text-[12px] font-medium text-background">
            Allow
          </button>
          <button type="button" onClick={() => onReject(step.id)} className="h-8 rounded-full border border-black/15 px-3.5 text-[12px] text-foreground/80 hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/[0.05]">
            Deny
          </button>
        </div>
      </div>
    );
  }

  if (command) {
    return (
      <div className="my-2">
        <CommandBlock command={command} status={step.state === "running" ? "running" : step.state === "error" ? "error" : step.state === "rejected" ? "rejected" : "done"} />
        {step.result ? (
          <button type="button" onClick={() => setOpen((current) => !current)} className="px-1 text-[11px] text-foreground/40 hover:text-foreground/70">
            {open ? "Hide output" : "Show output"}
          </button>
        ) : null}
        {open && step.result ? <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all px-1 font-mono text-[11.5px] leading-5 text-foreground/60">{step.result}</pre> : null}
      </div>
    );
  }

  return (
    <p className={cn("my-1 text-[13px] text-foreground/55", step.state === "error" && "text-red-400")}>
      {step.state === "running" ? "Working · " : ""}
      {step.description}
    </p>
  );
}
