import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";

export const streamdownPlugins = { cjk, code, math };

let mermaidPluginPromise: Promise<typeof import("@streamdown/mermaid")> | null = null;

export function loadMermaidPlugin() {
  mermaidPluginPromise ??= import("@streamdown/mermaid");
  return mermaidPluginPromise;
}
