// What the composer's reasoning/context chip can offer for a model, and how big
// its context window really is. Kode's own models come from the catalog; models
// from your own agents (Settings → Providers) depend on the agent:
//
//   Claude Code  effort low…max (--effort); window as Claude Code reports it
//   Codex        the OpenAI model's efforts (model_reasoning_effort)
//   Cursor       none: the level is part of the model ("Codex 5.3 High")
//   ACP agents   none: the agent decides (OpenCode, Grok, Gemini CLI…)
//
// Any model whose name already says its level ("… High", "… Thinking") gets no
// separate reasoning setting either. Windows the agents report are remembered
// per model, so the meter is right from the next chat on.
import {
  getKodeModelById,
  KODE_MODELS,
  kodeContextBudget,
  kodeContextOptions,
  type KodeEffort,
  type KodeModelOption,
} from "@repo/ai/lib/kode";
import type { AppSettings, ProviderKind } from "@/lib/app-settings";
import { getProvider, parseCliModelId } from "@/lib/kode-cli";

export const CLAUDE_CODE_EFFORTS: KodeEffort[] = ["low", "medium", "high", "xhigh", "max"];

export type ModelControls = {
  /** Effort choices; empty when this model has no separate reasoning setting. */
  efforts: KodeEffort[];
  /** Reasoning can be switched off entirely. */
  canDisable: boolean;
  /** Context window choices (Kode models); empty when the window is fixed. */
  contextOptions: number[];
  /** Kode models only: the catalog entry the options come from. */
  kodeModel: KodeModelOption | null;
  /** Agent kind for models from Settings → Providers, else null. */
  agent: ProviderKind | null;
  /** Shown in the menu when reasoning can't be set here. */
  note: string | null;
};

// ---------------------------------------------------------------------------
// Context windows the agents reported (Claude Code's modelUsage, ACP usage_update)
// ---------------------------------------------------------------------------

const WINDOWS_KEY = "kontinue.kode.model-windows";
let reported: Record<string, number> = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem(WINDOWS_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0),
    );
  } catch {
    return {};
  }
})();

export function rememberModelWindow(modelId: string, window: number) {
  if (!Number.isFinite(window) || window <= 0 || reported[modelId] === window) return;
  reported = { ...reported, [modelId]: window };
  try {
    localStorage.setItem(WINDOWS_KEY, JSON.stringify(reported));
  } catch {
    // Kept for this session only.
  }
}

/** "Codex 5.3 High", "Opus 5 Thinking", "grok-4.7-low": the level is in the name. */
const LEVEL_IN_NAME = /(?:^|[\s\-_./(])(minimal|low|medium|high|xhigh|extra[\s-]?high|max|thinking|reasoning|non-?thinking)(?=$|[\s\-_./)])/i;

export function levelInModelName(...names: (string | null | undefined)[]): boolean {
  return names.some((name) => !!name && LEVEL_IN_NAME.test(name));
}

/** "Claude Opus 5 1M Thinking" → 1,000,000. */
function windowFromName(name: string): number | null {
  const match = name.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*([MK])(?=\s|$)/i);
  if (!match) return null;
  const n = Number(match[1]) * (match[2].toUpperCase() === "M" ? 1_000_000 : 1_000);
  return n >= 32_000 ? n : null;
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A Kode catalog model that is the same underlying model (for Codex / Claude Code). */
function sameKodeModel(model: string): KodeModelOption | null {
  const want = slug(model);
  return KODE_MODELS.find((m) => slug(m.gatewayId) === want || slug(m.id) === want) ?? null;
}

// ---------------------------------------------------------------------------

export function getModelControls(modelId: string, settings: AppSettings, modelName?: string): ModelControls {
  const kodeModel = getKodeModelById(modelId);
  if (kodeModel) {
    return {
      efforts: kodeModel.reasoning.efforts,
      canDisable: kodeModel.reasoning.canDisable,
      contextOptions: kodeContextOptions(kodeModel),
      kodeModel,
      agent: null,
      note: null,
    };
  }

  const cli = parseCliModelId(modelId);
  const instance = cli ? getProvider(cli.instanceId, settings) : undefined;
  const agent = instance?.kind ?? null;
  const label = instance?.label ?? "This agent";
  const none = (note: string): ModelControls => ({
    efforts: [],
    canDisable: false,
    contextOptions: [],
    kodeModel: null,
    agent,
    note,
  });

  if (!cli) return none("Reasoning isn't adjustable for this model.");
  if (levelInModelName(cli.model, modelName)) {
    return none("The reasoning level is part of this model. Pick another version of it in the model list.");
  }

  switch (agent) {
    case "claude":
      // Haiku 4.5 thinks or not; it has no effort levels.
      if (/haiku-4/.test(cli.model)) return none("Claude Code decides how much this model thinks.");
      return {
        efforts: CLAUDE_CODE_EFFORTS,
        canDisable: false,
        contextOptions: [],
        kodeModel: null,
        agent,
        note: null,
      };
    case "codex": {
      const same = sameKodeModel(cli.model);
      const efforts = same?.reasoning.efforts ?? ["low", "medium", "high"];
      return { efforts, canDisable: false, contextOptions: [], kodeModel: null, agent, note: null };
    }
    case "cursor":
      return none("Cursor sets reasoning per model. Pick its Low, High or Extra High version in the model list.");
    default:
      return none(`${label} uses its own reasoning setting for this model.`);
  }
}

/**
 * The context window to measure against: the Kode budget you chose, else what
 * the agent reported, the same model in Kode's catalog, the live gateway
 * catalog, a size in the model's name, or null when nobody knows.
 */
export function resolveContextWindow(
  modelId: string,
  options: { chosen: number | null; gateway: Record<string, number>; modelName?: string },
): number | null {
  const kodeModel = getKodeModelById(modelId);
  if (kodeModel) return kodeContextBudget(kodeModel, options.chosen);
  if (reported[modelId]) return reported[modelId];
  if (options.gateway[modelId]) return options.gateway[modelId];
  const cli = parseCliModelId(modelId);
  const model = cli?.model ?? modelId;
  const same = sameKodeModel(model);
  if (same) return same.contextWindow;
  const fromName = windowFromName(options.modelName ?? "") ?? windowFromName(model);
  if (fromName) return fromName;
  const want = slug(model);
  const nameSlug = options.modelName ? slug(options.modelName) : null;
  for (const [id, size] of Object.entries(options.gateway)) {
    const s = slug(id);
    if (s === want || (nameSlug && s === nameSlug)) return size;
  }
  return null;
}
