import { ExpandableImage } from "@/components/ui/image-viewer";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, ChevronRight, Code2, FileText, ImageOff, Maximize2, Minimize2, Pencil, Terminal, Wrench, Check, Copy, Loader2, Play } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { artifactDocument, diffLineKind, isShellLanguage, runnableCommand, type RichSegment } from "@/lib/kode-rich-blocks";
import { useCodeRunTarget } from "./code-run-context";
import { parseSteps } from "@/lib/kode-steps";
import { ToolStepList } from "@/components/chat/ToolStep";
import { cn } from "@/lib/utils";

type ToolCard = Extract<RichSegment, { type: "tool" }>["card"];

function toolIcon(name: string) {
  const lower = name.toLowerCase();
  if (/(bash|shell|exec|command)/.test(lower)) return Terminal;
  if (/(edit|write|patch|str_replace|create)/.test(lower)) return Pencil;
  if (/(read|view|cat)/.test(lower)) return FileText;
  if (lower === "tool error") return AlertCircle;
  return Wrench;
}

/** An imported tool call: one row like the live tool steps, expanding to the
 *  command / diff and its result. */
export function ToolCardBlock({ card }: { card: ToolCard }) {
  const [open, setOpen] = useState(false);
  const Icon = toolIcon(card.name);
  const isDiff = !!card.detail && /^(?:---|\+\+\+|\*\*\* )/m.test(card.detail);
  const expandable = Boolean(card.detail || card.output);
  const box = "mt-1 ml-5 max-h-72 overflow-auto rounded-lg bg-black/[0.04] py-1.5 font-mono text-[11.5px] leading-[1.55] dark:bg-white/[0.05]";
  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn("flex w-full items-center gap-1.5 text-left text-[12.5px] text-foreground/55", expandable ? "cursor-pointer hover:text-foreground/80" : "cursor-default")}
      >
        <Icon className="size-3 shrink-0" />
        <span className="shrink-0">{card.name}</span>
        <span className="min-w-0 truncate font-mono text-[11.5px] text-foreground/45">{card.summary}</span>
        {card.isError ? <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 text-[10.5px] text-red-500 dark:text-red-400">failed</span> : null}
        {card.unknown ? (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 text-[10.5px] text-amber-600 dark:text-amber-400" title="The session ended before this call reported back. It may or may not have run.">
            no result
          </span>
        ) : null}
        {expandable ? <ChevronRight className={cn("size-3 shrink-0 opacity-50 transition-transform", open && "rotate-90")} /> : null}
      </button>
      {open ? (
        <>
          {card.detail ? (
            <pre className={box}>
              {isDiff
                ? card.detail.split("\n").map((line, index) => {
                    const kind = diffLineKind(line);
                    return (
                      <div key={index} className={cn("px-3", kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", kind === "remove" && "bg-red-500/10 text-red-700 dark:text-red-300", kind === "meta" && "text-muted-foreground")}>
                        {line || " "}
                      </div>
                    );
                  })
                : <div className="px-3 text-foreground/70">{card.detail}</div>}
            </pre>
          ) : null}
          {card.output ? <pre className={cn(box, "px-3 whitespace-pre-wrap", card.isError ? "text-red-600 dark:text-red-300" : "text-foreground/65")}>{card.output}</pre> : null}
        </>
      ) : null}
    </div>
  );
}

/** A screenshot saved into the project's .kode/attachments by the import. */
export function ImageBlock({ image }: { image: { path: string; mediaType: string; root?: string | null } }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!image.root) {
      setFailed(true);
      return;
    }
    let active = true;
    invoke<string>("kode_read_attachment", { root: image.root, path: image.path })
      .then((data) => active && setSrc(`data:${image.mediaType};base64,${data}`))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [image.path, image.root, image.mediaType]);
  if (failed) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-2xl border border-dashed border-black/10 px-3 py-2 text-[11px] text-muted-foreground dark:border-white/10">
        <ImageOff className="size-3.5" /> Screenshot saved on another device ({image.path})
      </div>
    );
  }
  const name = image.path.split("/").pop()?.replace(/^\d+-/, "") || "Image";
  return src ? (
    <ExpandableImage src={src} alt={name} wrapperClassName="my-2 block" className="max-h-72 rounded-2xl border border-black/[0.07] object-contain dark:border-white/[0.08]" />
  ) : (
    <div className="my-2 h-24 w-40 animate-pulse rounded-2xl bg-black/[0.05] dark:bg-white/[0.05]" />
  );
}

function useTheme(): "light" | "dark" {
  const read = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = useState<"light" | "dark">(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** Interactive HTML/JS from the agent, in a frame with scripts but no app access. */
export function ArtifactBlock({ html, title }: { html: string; title: string | null }) {
  const id = useId();
  const theme = useTheme();
  const [height, setHeight] = useState(240);
  const [expanded, setExpanded] = useState(false);
  const [showCode, setShowCode] = useState(false);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { kodeArtifact?: string; height?: number };
      if (data?.kodeArtifact === id && typeof data.height === "number") setHeight(Math.min(Math.max(data.height, 80), 2000));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id]);
  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-black/[0.07] dark:border-white/[0.08]">
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-3 py-1.5 text-[11px] text-muted-foreground dark:border-white/[0.06]">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/75">{title ?? "Interactive view"}</span>
        <button type="button" onClick={() => setShowCode((v) => !v)} className="cursor-pointer rounded-full p-1 hover:text-foreground" title={showCode ? "Show result" : "Show code"}>
          <Code2 className="size-3.5" />
        </button>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="cursor-pointer rounded-full p-1 hover:text-foreground" title={expanded ? "Shrink" : "Expand"}>
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>
      {showCode ? (
        <pre className="max-h-96 overflow-auto px-3 py-2 font-mono text-[11px]">{html}</pre>
      ) : (
        <iframe
          title={title ?? "Interactive view"}
          sandbox="allow-scripts"
          srcDoc={artifactDocument(html, theme, id)}
          style={{ height: expanded ? Math.max(height, 560) : Math.min(height, 520) }}
          className="block w-full border-0 bg-transparent"
        />
      )}
    </div>
  );
}

/** A finished turn's tool steps, saved with the message (kode-steps.ts). */
export function SavedStepsBlock({ json }: { json: string }) {
  const [open, setOpen] = useState(false);
  const steps = parseSteps(json);
  if (!steps?.length) return null;
  const edits = steps.filter((s) => /edit|write|patch|create|delete/i.test(s.name) && s.state === "done").length;
  const failed = steps.filter((s) => s.state === "error").length;
  const asked = steps.filter((s) => s.name === "ask_options").length;
  const parts = [`${steps.length} step${steps.length === 1 ? "" : "s"}`];
  if (edits) parts.push(`${edits} edit${edits === 1 ? "" : "s"}`);
  if (asked) parts.push(`${asked} question${asked === 1 ? "" : "s"}`);
  if (failed) parts.push(`${failed} failed`);
  return (
    <div className="mb-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-foreground/50 hover:text-foreground/75">
        <ChevronRight size={12} className={cn("shrink-0 transition-transform", open && "rotate-90")} />
        Worked through {parts.join(" · ")}
      </button>
      {open ? (
        <div className="mt-1 border-l border-black/[0.06] pl-3 dark:border-white/[0.08]">
          <ToolStepList steps={steps} />
        </div>
      ) : null}
    </div>
  );
}

// ── Code (Claude-style: one quiet box, copy on hover, ▶ Run for commands) ──

type ShikiModule = typeof import("shiki");
let shikiPromise: Promise<ShikiModule> | null = null;
const highlightCache = new Map<string, string>();

async function highlight(code: string, lang: string): Promise<string | null> {
  const key = `${lang}\u0000${code}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;
  shikiPromise ??= import("shiki");
  const shiki = await shikiPromise;
  const language = lang && (shiki.bundledLanguages as Record<string, unknown>)[lang.toLowerCase()] ? lang.toLowerCase() : null;
  if (!language) return null;
  const html = await shiki.codeToHtml(code, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
  if (highlightCache.size > 300) highlightCache.clear();
  highlightCache.set(key, html);
  return html;
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      title="Copy"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        })
      }
      className={cn("flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]", className)}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

type RunState = { status: "running" } | { status: "done"; output: string; ok: boolean; exitCode: number | null } | null;

export function CodeBlockView({ lang, code, complete }: { lang: string; code: string; complete: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>(null);
  const target = useCodeRunTarget();
  const shell = isShellLanguage(lang);
  const command = shell ? runnableCommand(code) : "";
  const canRun = shell && complete && Boolean(target) && Boolean(command);

  useEffect(() => {
    if (!complete) return;
    let active = true;
    void highlight(code, lang).then((value) => active && setHtml(value)).catch(() => {});
    return () => {
      active = false;
    };
  }, [code, lang, complete]);

  const runCommand = async () => {
    if (!target || !command) return;
    setRun({ status: "running" });
    try {
      const result = await invoke<{ stdout: string; stderr: string; exit_code: number | null; success: boolean }>("kode_run_command", {
        root: target.root,
        command,
        cwd: null,
        env: target.env ?? null,
      });
      const output = [result.stdout, result.stderr].filter((part) => part.trim()).join("\n").trimEnd();
      setRun({ status: "done", output, ok: result.success, exitCode: result.exit_code });
    } catch (error) {
      setRun({ status: "done", output: error instanceof Error ? error.message : String(error), ok: false, exitCode: null });
    }
  };

  const body = html ? (
    <div className="kode-shiki min-w-0 flex-1 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-foreground/85">{code}</pre>
  );

  return (
    <div className="my-3">
      <div className="group/code relative flex items-start gap-2 rounded-xl border border-[var(--code-border)] bg-[var(--code-bg)] py-2.5 pr-2 pl-4 font-mono text-[12.5px] leading-[1.65]">
        <div className="min-w-0 flex-1 py-0.5">{body}</div>
        {shell ? (
          // Commands: Run and Copy always visible, like Claude.
          <div className="flex shrink-0 items-center gap-0.5 self-start">
            {canRun ? (
              <button
                type="button"
                aria-label="Run in terminal"
                title={`Run in ${target?.root.split(/[\\/]/).pop() ?? "the project"}`}
                onClick={() => void runCommand()}
                disabled={run?.status === "running"}
                className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground/55 transition-colors hover:bg-black/[0.06] hover:text-foreground disabled:cursor-default dark:hover:bg-white/[0.08]"
              >
                {run?.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              </button>
            ) : null}
            <CopyButton text={command || code} />
          </div>
        ) : (
          // Code: Copy appears on hover.
          <CopyButton text={code} className="absolute top-1.5 right-1.5 bg-[var(--code-bg)] opacity-0 group-hover/code:opacity-100" />
        )}
      </div>
      {run ? (
        <div className="mt-1.5 rounded-xl border border-[var(--code-border)] bg-[var(--code-bg)] px-4 py-2.5 font-mono text-[12px] leading-[1.6]">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-foreground/80">
            <span className="text-foreground/45">$ </span>
            {command}
            {run.status === "running" ? (
              <span className="mt-1 flex items-center gap-1.5 font-sans text-[11.5px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Running…
              </span>
            ) : run.output ? (
              `\n${run.output}`
            ) : (
              "\n"
            )}
          </pre>
          {run.status === "done" ? (
            <p className={cn("mt-1.5 font-sans text-[11px]", run.ok ? "text-muted-foreground" : "text-red-500 dark:text-red-400")}>
              {run.ok ? "Finished" : `Failed${run.exitCode !== null ? ` (exit code ${run.exitCode})` : ""}`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
