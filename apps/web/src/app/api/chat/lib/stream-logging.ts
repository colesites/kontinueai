type FinalStreamLogInput = {
  modelId: string;
  planTier: string;
  requestedToolNames: string[];
  appliedToolNames: string[];
  webSearchEnabled: boolean;
  hasWebSearchCapability: boolean;
  supportsTools: boolean;
  imageAspectRatio: string | null;
  imageSize: string | null;
  openaiImageToolSize: string | null;
  forceWebSearchTool: boolean;
  forceImageTool: boolean;
  stopWhenCount: number;
  maxSteps: number;
  systemPrompt: string;
  messageCount: number;
};

export function logFinalStreamOptions(options: FinalStreamLogInput): void {
  console.log("[chat-debug] final stream options", {
    model: options.modelId,
    planTier: options.planTier,
    requestedToolNames: options.requestedToolNames,
    appliedToolNames: options.appliedToolNames,
    webSearchEnabled: options.webSearchEnabled,
    hasWebSearchCapability: options.hasWebSearchCapability,
    supportsTools: options.supportsTools,
    imageAspectRatio: options.imageAspectRatio,
    imageSize: options.imageSize,
    openaiImageToolSize: options.openaiImageToolSize,
    forceWebSearchTool: options.forceWebSearchTool,
    forceImageTool: options.forceImageTool,
    hasStopWhen: options.stopWhenCount > 0,
    maxSteps: options.maxSteps,
    hasSystemWebSearchInstruction: options.systemPrompt.includes("perplexity_search"),
    messageCount: options.messageCount,
  });
}
