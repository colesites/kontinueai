// Plugin agents (Claude Code subagents: agents/*.md with a description and a
// system prompt) as one Kode tool, `run_agent`. Kode hands a task to the
// specialist, which works on the same project with its own prompt and returns
// its answer. It runs unattended: anything needing approval is declined.

import { runKodeAgent, type KodeExtraTool } from "./kode-agent";
import type { InstalledPlugin } from "./kode-plugins";
import type { KodeAgentMode } from "./kode-tools";

export type PluginAgentRef = { id: string; plugin: string; name: string; description: string; prompt: string };

export function pluginAgents(plugins: InstalledPlugin[]): PluginAgentRef[] {
  return plugins
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.agents.map((agent) => ({
        id: `${p.name}:${agent.name}`,
        plugin: p.name,
        name: agent.name,
        description: agent.description,
        prompt: agent.prompt,
      })),
    );
}

/** Find an agent by "plugin:name" or just "name". */
export function findPluginAgent(agents: PluginAgentRef[], requested: string): PluginAgentRef | undefined {
  const want = requested.trim().toLowerCase();
  return agents.find((a) => a.id.toLowerCase() === want) ?? agents.find((a) => a.name.toLowerCase() === want);
}

export function buildPluginAgentTool(input: {
  plugins: InstalledPlugin[];
  root: string;
  modelId: string;
  mode: KodeAgentMode;
}): KodeExtraTool | null {
  const agents = pluginAgents(input.plugins);
  if (agents.length === 0) return null;
  const list = agents.map((a) => `- ${a.id}: ${a.description.slice(0, 220)}`).join("\n");
  return {
    describe: (args) => `Ask ${typeof args.agent === "string" ? args.agent : "an agent"}`,
    definition: {
      type: "function",
      function: {
        name: "run_agent",
        description: `Hand a task to a specialist agent from an installed plugin. It works on this project with its own expertise and returns its answer. Use when a task clearly matches one of these:\n${list}`,
        parameters: {
          type: "object",
          properties: {
            agent: { type: "string", enum: agents.map((a) => a.id), description: "Which agent." },
            task: { type: "string", description: "A complete, self-contained task for the agent." },
          },
          required: ["agent", "task"],
        },
      },
    },
    run: async (args, signal) => {
      const agent = findPluginAgent(agents, typeof args.agent === "string" ? args.agent : "");
      if (!agent) throw new Error(`No agent named ${String(args.agent)}.`);
      const task = typeof args.task === "string" ? args.task.trim() : "";
      if (!task) throw new Error("Give the agent a task.");
      let text = "";
      const declined: string[] = [];
      const result = await runKodeAgent({
        modelId: input.modelId,
        history: [],
        userText: task,
        mode: input.mode,
        projectRoot: input.root,
        extraSystemContext: `You are the "${agent.name}" agent from the ${agent.plugin} plugin.\n\n${agent.prompt}`,
        onText: (delta) => {
          text += delta;
        },
        onReasoning: () => {},
        onToolStep: () => {},
        requestApproval: async (step) => {
          declined.push(step.description || step.name);
          return false;
        },
        requestOptions: async () => [],
        signal,
      });
      const answer = (result.content || text).trim() || "(no answer)";
      const note = declined.length
        ? `\n\n(Ran without the user, so these needed approval and were skipped: ${[...new Set(declined)].join(", ")}.)`
        : "";
      return `${agent.id} says:\n\n${answer}${note}`;
    },
  };
}
