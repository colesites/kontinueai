// ── Agents ──────────────────────────────────────────────────────────────────
// Kontinue's specialized AI agents. Per spec, agents do NOT have separate memory
// systems — they share the user's memory, projects, tasks, and conversations.
// An agent is therefore just a personality + system prompt + suggested actions
// layered on top of the same chat pipeline. Selecting an agent for a chat simply
// prepends its `systemPrompt` to the base Kontinue system prompt.

export type AgentId =
  | "research"
  | "coding"
  | "marketing"
  | "assistant";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  /** lucide-react icon name (resolved in the UI). */
  icon: string;
  /** Short tagline shown on cards. */
  description: string;
  /** Accent color token / hex for the agent's avatar. */
  color: string;
  /** Bullet capabilities shown on the agent page. */
  capabilities: string[];
  /** Prepended to the base system prompt when this agent is active. */
  systemPrompt: string;
  /** One-tap prompts surfaced in the UI to kick off a conversation. */
  suggestedActions: string[];
  /** Lowercased keywords used by the lightweight recommendation heuristic. */
  recommendKeywords: string[];
}

export const AGENTS: AgentDefinition[] = [
  {
    id: "research",
    name: "Research Agent",
    icon: "Telescope",
    description: "Deep research, web search, citations, and report generation.",
    color: "#6366f1",
    capabilities: [
      "Deep research",
      "Web search",
      "Citations",
      "PDF analysis",
      "Report generation",
      "Fact checking",
    ],
    systemPrompt:
      "You are the Research Agent for Kontinue AI. You excel at deep, rigorous research. Always ground claims in evidence, cite sources when you use web search, and clearly separate established facts from speculation. Prefer structured, well-organized reports with headings and bullet points. When a question is ambiguous, state your assumptions. Fact-check before asserting, and flag uncertainty explicitly.",
    suggestedActions: [
      "Research the latest developments in AI agents",
      "Summarize this paper and fact-check its claims",
      "Write a literature review on a topic",
      "Compare these technologies with citations",
    ],
    recommendKeywords: [
      "research",
      "find out",
      "sources",
      "cite",
      "citation",
      "paper",
      "study",
      "analyze",
      "fact check",
      "investigate",
      "literature",
      "compare",
      "report",
    ],
  },
  {
    id: "coding",
    name: "Coding Agent",
    icon: "Code2",
    description: "Code generation, debugging, architecture, and code review.",
    color: "#10b981",
    capabilities: [
      "Code generation",
      "Debugging",
      "Architecture planning",
      "GitHub integration",
      "Code review",
      "Documentation",
    ],
    systemPrompt:
      "You are the Coding Agent for Kontinue AI. You are a senior software engineer. Write clean, correct, idiomatic, production-ready code. Explain trade-offs concisely. When debugging, reason about root causes rather than guessing. Prefer minimal, focused diffs. Use the user's connected GitHub when relevant. Always consider edge cases, security, and performance.",
    suggestedActions: [
      "Review my code for bugs and improvements",
      "Help me debug this error",
      "Design the architecture for a new feature",
      "Open a GitHub issue for this bug",
    ],
    recommendKeywords: [
      "code",
      "bug",
      "debug",
      "function",
      "error",
      "typescript",
      "javascript",
      "python",
      "react",
      "api",
      "refactor",
      "deploy",
      "github",
      "repo",
      "stack trace",
      "compile",
      "build",
    ],
  },
  {
    id: "marketing",
    name: "Marketing Agent",
    icon: "Megaphone",
    description: "Content, branding, campaigns, SEO, and product launches.",
    color: "#f59e0b",
    capabilities: [
      "Content creation",
      "Branding",
      "Social media planning",
      "Campaign generation",
      "SEO writing",
      "Product launches",
    ],
    systemPrompt:
      "You are the Marketing Agent for Kontinue AI. You are a world-class growth marketer and copywriter. Write persuasive, on-brand, audience-aware content. Think in terms of hooks, value propositions, and clear calls to action. Suggest channels, angles, and formats. For SEO, consider intent and keywords naturally. Be concrete: give ready-to-use copy, not vague advice.",
    suggestedActions: [
      "Write a launch announcement for my product",
      "Plan a week of social media posts",
      "Draft SEO-optimized copy for my landing page",
      "Brainstorm campaign ideas for a new feature",
    ],
    recommendKeywords: [
      "marketing",
      "campaign",
      "launch",
      "social media",
      "tweet",
      "post",
      "seo",
      "copy",
      "brand",
      "audience",
      "ad",
      "newsletter",
      "growth",
      "landing page",
      "headline",
    ],
  },
  {
    id: "assistant",
    name: "Personal Assistant",
    icon: "CalendarCheck",
    description: "Scheduling, reminders, productivity, and follow-ups.",
    color: "#ec4899",
    capabilities: [
      "Scheduling",
      "Reminders",
      "Productivity",
      "Goal tracking",
      "Personal organization",
      "Follow-ups",
    ],
    systemPrompt:
      "You are the Personal Assistant for Kontinue AI. You help the user stay organized and on top of their commitments. Proactively create tasks and reminders when the user mentions something to do. Suggest sensible deadlines and priorities. Keep responses brief and action-oriented. When you create a task or reminder, confirm it succinctly. Help break big goals into concrete next steps.",
    suggestedActions: [
      "Remind me to follow up with a client tomorrow",
      "Plan my day around these priorities",
      "Break this goal into actionable tasks",
      "Schedule a recurring weekly review",
    ],
    recommendKeywords: [
      "remind",
      "reminder",
      "schedule",
      "task",
      "todo",
      "deadline",
      "follow up",
      "follow-up",
      "calendar",
      "meeting",
      "plan my",
      "organize",
      "goal",
      "tomorrow",
      "next week",
    ],
  },
];

export const AGENTS_BY_ID: Record<AgentId, AgentDefinition> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
) as Record<AgentId, AgentDefinition>;

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && value in AGENTS_BY_ID;
}

export function getAgent(id: string | null | undefined): AgentDefinition | null {
  if (!id) return null;
  return isAgentId(id) ? AGENTS_BY_ID[id] : null;
}

/**
 * Lightweight, dependency-free intent detection. Scores each agent by how many
 * of its keywords appear in the text and returns the best match above a small
 * threshold. Used to suggest (never force) an agent for a message.
 */
export function recommendAgent(text: string): AgentDefinition | null {
  const haystack = text.toLowerCase();
  if (haystack.trim().length < 4) return null;

  let best: { agent: AgentDefinition; score: number } | null = null;
  for (const agent of AGENTS) {
    let score = 0;
    for (const kw of agent.recommendKeywords) {
      if (haystack.includes(kw)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { agent, score };
    }
  }
  return best ? best.agent : null;
}
