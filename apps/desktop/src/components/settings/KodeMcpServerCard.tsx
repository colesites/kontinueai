// "Use Kode from other agents": how to add Kode's own MCP server
// (checkpoint_kontinue_session + orchestration tools) to Claude Code, Codex
// or any MCP client.

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { mcpServerCommand } from "@/lib/kode-orchestration";

function quote(path: string): string {
  return /[\s"'$]/.test(path) ? `"${path.replace(/"/g, '\\"')}"` : path;
}

export function KodeMcpServerCard() {
  const [command, setCommand] = useState<{ command: string; args: string[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    void mcpServerCommand().then(setCommand);
  }, []);
  if (!command) return null;
  const line = `${quote(command.command)} ${command.args.join(" ")}`;
  const snippets = [
    { id: "claude", label: "Claude Code", text: `claude mcp add --scope user kontinue -- ${line}` },
    { id: "codex", label: "Codex (~/.codex/config.toml)", text: `[mcp_servers.kontinue]\ncommand = ${JSON.stringify(command.command)}\nargs = ${JSON.stringify(command.args)}` },
    { id: "json", label: "Any MCP client (JSON)", text: JSON.stringify({ mcpServers: { kontinue: command } }, null, 2) },
  ];
  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <div className="kontinue-3d mb-4 rounded-[18px] px-4 py-3.5">
      <p className="text-body font-medium text-foreground">Use Kode from other agents</p>
      <p className="mt-0.5 text-label text-muted-foreground">
        Kode runs its own MCP server. Agents get <code>checkpoint_kontinue_session</code> (syncs an imported chat right away) and tools to list projects and threads, start threads in other repos, message threads and hand off context.
      </p>
      <div className="mt-3 space-y-2">
        {snippets.map((snippet) => (
          <div key={snippet.id}>
            <p className="mb-1 text-caption text-foreground/70">{snippet.label}</p>
            <div className="flex items-start gap-2 rounded-2xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.05]">
              <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-caption leading-relaxed text-foreground/80">{snippet.text}</pre>
              <button type="button" onClick={() => copy(snippet.id, snippet.text)} aria-label={`Copy ${snippet.label}`} className="shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground hover:text-foreground">
                {copied === snippet.id ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
