import { generateText, stepCountIs, type LanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { K_AI_PRIMARY_MODEL, K_AI_MODEL_CHAIN } from "@repo/ai/lib/kai";
import { getAgent, isAgentId } from "@repo/ai/lib/agents";
import { ownerConnectorTokens } from "../../chat/lib/connector-tokens";
import { buildAutonomousConnectorTools } from "../../chat/lib/tools-config";
import { detectSearchIntent } from "../../chat/lib/web-search/intent";
import { searchWithFallback } from "../../chat/lib/web-search/providers";

export const maxDuration = 120;

// Internal endpoint invoked by the Convex agent-task cron (server-to-server). It
// runs K-AI with the user's connector tools using OWNER-SCOPED token access
// (no user session) and returns the final text. Guarded by AGENT_TASK_SECRET.
export async function POST(req: Request) {
  const secret = process.env.AGENT_TASK_SECRET;
  if (!secret) {
    return Response.json({ error: "Not configured" }, { status: 500 });
  }
  if (req.headers.get("x-agent-secret") !== secret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const openRouterKey = process.env.OPEN_ROUTER;
  if (!openRouterKey) {
    return Response.json({ error: "AI not configured" }, { status: 500 });
  }

  let body: { ownerId?: string; instruction?: string; agentId?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { ownerId, instruction } = body;
  if (!ownerId || !instruction) {
    return Response.json({ error: "Missing ownerId/instruction" }, { status: 400 });
  }

  try {
    const tokens = ownerConnectorTokens(ownerId, secret);
    const tools = buildAutonomousConnectorTools(tokens, null);

    // Lightweight web-search injection (no cache/quota in autonomous runs).
    let webContext = "";
    const intent = detectSearchIntent(instruction, { aggressive: true });
    if (intent.shouldSearch) {
      const search = await searchWithFallback(instruction);
      if (search) {
        const lines: string[] = [];
        if (search.answer) lines.push(`Search synthesis: ${search.answer}`, "");
        search.results.slice(0, 5).forEach((r, i) => {
          lines.push(`[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 800)}`, "");
        });
        webContext = `\n\nWEB SEARCH RESULTS (live):\n${lines.join("\n")}\nCite sources as markdown links and end with a Sources list.`;
      }
    }

    const agent =
      body.agentId && isAgentId(body.agentId) ? getAgent(body.agentId) : null;
    const agentContext = agent
      ? `\n\nACTIVE AGENT — ${agent.name}: ${agent.systemPrompt}`
      : "";

    const system = [
      "You are K-AI 1.0, Kontinue AI's intelligence layer, running a SCHEDULED autonomous task for the user (they are NOT present to answer questions).",
      "Carry out the instruction end-to-end using your connected tools (gmail, google_calendar, google_drive, notion, github, vercel) — actually call them to read/act on the user's accounts.",
      "If a tool reports the connector isn't connected, note that in your result. Never ask the user a question — make reasonable assumptions and proceed.",
      "Produce a clear, self-contained result the user can read later. After any tool call, summarize what you found or did.",
      agentContext,
      webContext,
    ].join("\n");

    const openrouter = createOpenRouter({ apiKey: openRouterKey });
    const model = openrouter.chat(K_AI_PRIMARY_MODEL, {
      models: K_AI_MODEL_CHAIN,
    }) as unknown as LanguageModel;

    const { text } = await generateText({
      model,
      system,
      prompt: instruction,
      tools,
      stopWhen: stepCountIs(6),
      maxOutputTokens: 1500,
    });

    return Response.json({ text: text ?? "" });
  } catch (error) {
    console.error("[agent-task] run failed", error);
    return Response.json({ error: "Run failed" }, { status: 500 });
  }
}
