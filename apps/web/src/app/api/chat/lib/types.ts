export type AiGatewayModel = {
  id: string;
  type?: string;
  tags?: string[];
  pricing?: Record<string, unknown>;
};

export type OpenAIImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
