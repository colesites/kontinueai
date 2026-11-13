// Right panel: the dev servers and background commands the agent started in
// this chat (src-tauri/src/bg_tasks.rs), like Claude Code's Servers /
// Background tasks. Click one to see its latest output; ■ stops it. Servers
// that Claude Code, Codex or an ACP agent started themselves are found by port
// (any process listening from inside the project folder) and listed too.

import { CheckCircle2, ChevronRight, Server, Square, SquareTerminal, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/lib/utils";

export type BackgroundTask = {
  id: string;
  command: string;
  name: string | null;
  status: "running" | "exited" | "stopped" | "failed";
  port: number | null;
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
};

/** "2h 47m", "5m", "12s". */
export function elapsed(from: number, to: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** A server some other agent (or you) started in this project, found by its port. */
export type DetectedServer = { pid: number; port: number; command: string };

/** Detected servers Kode isn't already tracking (same port = same server). */
export function untrackedServers(detected: DetectedServer[], tracked: BackgroundTask[]): DetectedServer[] {
  const ports = new Set(tracked.filter((t) => t.status === "running" && t.port).map((t) => t.port));
  return detected.filter((server) => !ports.has(server.port));
}

/** "node /…/node_modules/.bin/vite --port 3210" → "vite --port 3210". */
export function shortCommand(command: string): string {
  const parts = command.trim().split(/\s+/);
  const skip = /(^|\/)(node|bun|deno|python3?|ruby|sh|bash|zsh)$/;
  // Drop the runtime only in front of a script path ("node /…/vite"), not "bun run dev".
  const start = parts.length > 1 && skip.test(parts[0]) && parts[1].includes("/") && !parts[1].startsWith("-") ? 1 : 0;
  return parts
    .slice(start)
    .map((part, i) => (i === 0 ? part.replace(/^.*\//, "") : part))
    .join(" ")
    .slice(0, 80);
}

export function useDetectedServers(root: string | null) {
  const [servers, setServers] = useState<DetectedServer[]>([]);
  const refresh = useCallback(async () => {
    if (!root) return setServers([]);
    try {
      const next = await invoke<DetectedServer[]>("kode_detect_servers", { root });
      setServers((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    } catch {
      setServers((current) => (current.length ? [] : current));
    }
  }, [root]);
  useEffect(() => {
    void refresh();
    // Scanning ports costs more than reading Kode's own list: every 5s.
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { servers, refresh };
}

export function splitTasks(tasks: BackgroundTask[]) {
  const running = tasks.filter((task) => task.status === "running");
  return {
    servers: running.filter((task) => task.port),
    jobs: running.filter((task) => !task.port),
    finished: tasks.filter((task) => task.status !== "running"),
  };
}

export function useBackgroundTasks(chatId: string | null) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const refresh = useCallback(async () => {
    if (!chatId) return setTasks([]);
    try {
      const next = await invoke<BackgroundTask[]>("kode_bg_list", { chatId });
      // Polled every 2s: only re-render when something actually changed.
      setTasks((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    } catch {
      setTasks((current) => (current.length ? [] : current));
    }
  }, [chatId]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { tasks, refresh };
}

function TaskRow({ task, onStop, icon }: { task: BackgroundTask; onStop?: () => void; icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [output, setOutput] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = () =>
      void invoke<string>("kode_bg_output", { id: task.id, maxChars: 6_000 })
        .then((text) => active && setOutput(text))
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 1_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open, task.id]);
  const label = task.name ?? task.command;
  return (
    <div>
      <div className="flex items-center gap-2.5 py-1">
        <button type="button" onClick={() => setOpen((v) => !v)} title={task.command} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left hover:text-foreground">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-body text-foreground/90">{label}</span>
        </button>
        {task.port ? (
          <button type="button" onClick={() => void openUrl(`http://localhost:${task.port}`)} title="Open in your browser" className="shrink-0 cursor-pointer text-label text-muted-foreground hover:text-foreground hover:underline">
            localhost:{task.port}
          </button>
        ) : (
          <span className="shrink-0 text-label text-muted-foreground">
            {task.status === "running" ? elapsed(task.startedAt) : task.status === "exited" ? "done" : task.status}
          </span>
        )}
        {onStop ? (
          <button type="button" onClick={onStop} aria-label={`Stop ${label}`} title="Stop" className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-foreground/70 hover:text-foreground">
            <Square size={11} className="fill-current" />
          </button>
        ) : null}
      </div>
      {open ? (
        <pre className="mb-1.5 ml-6 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/[0.04] px-2.5 py-2 font-mono text-caption leading-[1.55] text-foreground/70 dark:bg-white/[0.05]">
          <span className="text-foreground/45">$ {task.command}</span>
          {output ? `\n${output.trimEnd()}` : "\n(no output yet)"}
        </pre>
      ) : null}
    </div>
  );
}

function DetectedServerRow({ server, onStop }: { server: DetectedServer; onStop: () => void }) {
  const label = shortCommand(server.command) || `Process ${server.pid}`;
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className="shrink-0 text-muted-foreground">
        <Server size={14} />
      </span>
      <span title={server.command} className="min-w-0 flex-1 truncate text-body text-foreground/90">
        {label}
      </span>
      <button type="button" onClick={() => void openUrl(`http://localhost:${server.port}`)} title="Open in your browser" className="shrink-0 cursor-pointer text-label text-muted-foreground hover:text-foreground hover:underline">
        localhost:{server.port}
      </button>
      <button type="button" onClick={onStop} aria-label={`Stop ${label}`} title="Stop" className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-foreground/70 hover:text-foreground">
        <Square size={11} className="fill-current" />
      </button>
    </div>
  );
}

export function BackgroundTasksSections({
  chatId,
  root = null,
  Section,
  Divider,
}: {
  chatId: string | null;
  /** Project folder: also lists servers other agents started there. */
  root?: string | null;
  Section: (props: { title: string; children: React.ReactNode }) => React.ReactElement;
  Divider: () => React.ReactElement;
}) {
  const { tasks, refresh } = useBackgroundTasks(chatId);
  const detected = useDetectedServers(root);
  const [showFinished, setShowFinished] = useState(false);
  const { servers, jobs, finished } = splitTasks(tasks);
  const others = untrackedServers(detected.servers, tasks);
  const stop = (id: string) => void invoke("kode_bg_stop", { id }).then(refresh, refresh);
  const stopDetected = (pid: number) =>
    void invoke("kode_stop_detected_server", { root, pid }).then(detected.refresh, detected.refresh);
  if (tasks.length === 0 && others.length === 0) return null;
  return (
    <>
      {servers.length || others.length ? (
        <>
          <Divider />
          <Section title="Servers">
            {servers.map((task) => (
              <TaskRow key={task.id} task={task} icon={<Server size={14} />} onStop={() => stop(task.id)} />
            ))}
            {others.map((server) => (
              <DetectedServerRow key={server.pid} server={server} onStop={() => stopDetected(server.pid)} />
            ))}
          </Section>
        </>
      ) : null}
      {jobs.length || finished.length ? (
        <>
          <Divider />
          <Section title="Background tasks">
            {jobs.map((task) => (
              <TaskRow key={task.id} task={task} icon={<SquareTerminal size={14} />} onStop={() => stop(task.id)} />
            ))}
            {finished.length ? (
              <>
                <button type="button" onClick={() => setShowFinished((v) => !v)} className="flex w-full cursor-pointer items-center gap-2.5 py-1 text-left">
                  <span className="shrink-0 text-muted-foreground">
                    <CheckCircle2 size={14} />
                  </span>
                  <span className="flex-1 text-body text-foreground/90">{finished.length} finished</span>
                  <ChevronRight size={12} className={cn("text-muted-foreground transition-transform", showFinished && "rotate-90")} />
                </button>
                {showFinished
                  ? finished.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        icon={task.status === "failed" ? <XCircle size={14} className="text-red-500" /> : <SquareTerminal size={14} />}
                      />
                    ))
                  : null}
              </>
            ) : null}
          </Section>
        </>
      ) : null}
    </>
  );
}
