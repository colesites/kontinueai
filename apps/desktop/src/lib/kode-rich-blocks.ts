// Splitting a message into Markdown and Kode's rich blocks:
// - ```kode-tool   imported tool calls (Read/Edit/Bash, diffs, results)
// - ```kode-image  screenshots saved from an imported session
// - ```kode-artifact / ```html-live   interactive HTML/JS made by the agent
//   (charts, diagrams), rendered in a sandboxed frame
// Only closed fences become blocks, so a block that is still streaming shows
// as plain text until it finishes.

export type RichSegment =
  | { type: "markdown"; text: string }
  | { type: "tool"; card: { name: string; summary: string; detail?: string; output?: string; isError?: boolean; unknown?: boolean } }
  | { type: "image"; image: { path: string; mediaType: string; root?: string | null } }
  | { type: "artifact"; html: string; title: string | null }
  | { type: "steps"; json: string }
  | { type: "code"; lang: string; code: string; complete: boolean };

const RICH = /(^|\n)```(kode-tool|kode-image|kode-artifact|html-live|kode-steps)[^\n]*\n([\s\S]*?)\n```(?=\n|$)/g;

// Fenced code at the start of a line (not indented inside a list).
const FENCE = /(^|\n)```([\w+#.-]*)[^\n]*\n([\s\S]*?)\n```(?=\n|$)/g;
const OPEN_FENCE = /(^|\n)```([\w+#.-]*)[^\n]*\n([\s\S]*)$/;
// Kode's own blocks and diagrams keep their dedicated renderers.
const SPECIAL = new Set(["kode-tool", "kode-image", "kode-artifact", "html-live", "kode-steps", "mermaid"]);

export function hasRichBlocks(text: string): boolean {
  return text.includes("```");
}

const SHELL = new Set(["bash", "sh", "zsh", "shell", "console", "terminal", "fish", "powershell", "ps1", "cmd"]);

/** Shell code gets a Run button (like Claude's suggested commands). */
export function isShellLanguage(lang: string): boolean {
  return SHELL.has(lang.toLowerCase());
}

/** A shell block's runnable command: drop "$ " prompts and comment lines. */
export function runnableCommand(code: string): string {
  return code
    .split("\n")
    .map((line) => line.replace(/^\s*\$\s?/, ""))
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .join("\n")
    .trim();
}

/** Split plain code fences out of a Markdown segment (and an unclosed one at the end while streaming). */
function splitCode(text: string, out: RichSegment[], push: (value: string) => void) {
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    if (SPECIAL.has(match[2])) continue;
    const start = (match.index ?? 0) + match[1].length;
    push(text.slice(last, start));
    out.push({ type: "code", lang: match[2], code: match[3], complete: true });
    last = (match.index ?? 0) + match[0].length;
  }
  const rest = text.slice(last);
  const open = rest.match(OPEN_FENCE);
  if (open && !SPECIAL.has(open[2])) {
    const start = (open.index ?? 0) + open[1].length;
    push(rest.slice(0, start));
    out.push({ type: "code", lang: open[2], code: open[3], complete: false });
    return;
  }
  push(rest);
}

export function splitRichBlocks(text: string): RichSegment[] {
  const segments: RichSegment[] = [];
  let last = 0;
  const pushMarkdown = (value: string) => {
    if (!value.trim()) return;
    const previous = segments.at(-1);
    if (previous?.type === "markdown") previous.text += value;
    else segments.push({ type: "markdown", text: value });
  };
  const pushText = (value: string) => splitCode(value, segments, pushMarkdown);
  for (const match of text.matchAll(RICH)) {
    const start = (match.index ?? 0) + match[1].length;
    pushText(text.slice(last, start));
    const lang = match[2];
    const body = match[3];
    last = (match.index ?? 0) + match[0].length;
    if (lang === "kode-steps") {
      segments.push({ type: "steps", json: body });
      continue;
    }
    if (lang === "kode-tool" || lang === "kode-image") {
      try {
        const data = JSON.parse(body);
        if (lang === "kode-tool" && typeof data?.name === "string") {
          segments.push({ type: "tool", card: data });
          continue;
        }
        if (lang === "kode-image" && typeof data?.path === "string") {
          segments.push({ type: "image", image: data });
          continue;
        }
      } catch {
        // fall through to plain text
      }
      pushText(match[0]);
      continue;
    }
    const title = body.match(/<title>([^<]{1,80})<\/title>/i)?.[1]?.trim() ?? null;
    segments.push({ type: "artifact", html: body, title });
  }
  pushText(text.slice(last));
  return segments;
}

/** Diff lines → kind, for coloring `- old` / `+ new`. */
export function diffLineKind(line: string): "add" | "remove" | "meta" | "context" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("***") || line.startsWith("@@")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

/**
 * The document loaded into an artifact frame: the agent's HTML plus theme
 * variables and a height reporter (the frame has no access to the app).
 */
export function artifactDocument(html: string, theme: "light" | "dark", frameId: string): string {
  const vars =
    theme === "dark"
      ? "--bg:#141414;--fg:#ececec;--muted:#9a9a9a;--border:#2a2a2a;--accent:#a78bfa;"
      : "--bg:#ffffff;--fg:#18181b;--muted:#71717a;--border:#e4e4e7;--accent:#7c3aed;";
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:${theme};${vars}}html,body{margin:0;background:transparent;color:var(--fg);font:13px/1.5 system-ui,-apple-system,sans-serif}body{padding:12px}</style>`;
  const reporter = `<script>(function(){var id=${JSON.stringify(frameId)};function send(){parent.postMessage({kodeArtifact:id,height:Math.ceil(document.documentElement.scrollHeight)},"*")}new ResizeObserver(send).observe(document.documentElement);window.addEventListener("load",send);send()})();</script>`;
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${head}`).replace(/<\/body>/i, `${reporter}</body>`);
  }
  return `<!doctype html><html><head>${head}</head><body>${html}${reporter}</body></html>`;
}
