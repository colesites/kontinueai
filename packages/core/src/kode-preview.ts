export type KodePreviewFile = {
  path: string;
  content: string;
};

const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src https: data:",
  "font-src https: data:",
  "style-src 'unsafe-inline' https:",
  "script-src 'unsafe-inline'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

function escapeClosingTag(value: string, tag: "style" | "script"): string {
  return value.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

/** Builds the same sandboxed, self-contained Kode preview on web and native. */
export function buildKodePreviewDocument(files: KodePreviewFile[]): string {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  let html =
    byPath.get("index.html") ??
    "<!doctype html><html><body><main><h1>Kode project</h1></main></body></html>";
  const css = escapeClosingTag(byPath.get("styles.css") ?? "", "style");
  const js = escapeClosingTag(byPath.get("script.js") ?? "", "script");

  html = html
    .replace(/<link\b[^>]*href=["'](?:\.\/)?styles\.css["'][^>]*>/gi, "")
    .replace(
      /<script\b[^>]*src=["'](?:\.\/)?script\.js["'][^>]*>\s*<\/script>/gi,
      "",
    );

  const headContent = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>`;
  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${headContent}`);
  } else if (/<html[\s>]/i.test(html)) {
    html = html.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${headContent}</head>`,
    );
  } else {
    html = `<!doctype html><html><head>${headContent}</head><body>${html}</body></html>`;
  }

  const scriptContent = `<script>${js}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${scriptContent}</body>`);
  }
  return `${html}${scriptContent}`;
}

export function kodeDownloadFilename(title: string): string {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${safe || "kode-project"}.html`;
}
