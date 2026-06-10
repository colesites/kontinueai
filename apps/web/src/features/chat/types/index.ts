interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  onStop?: () => void;
  model: string;
  onModelChange: (modelId: string) => void;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: () => void;
  imageAspectRatio?: string;
  imageSize?: string | null;
  onImageAspectRatioChange?: (value: string) => void;
  onImageSizeChange?: (value: string | null) => void;
  agentId?: string | null;
  onAgentChange?: (value: string | null) => void;
}

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  /** Data URLs or http(s) URLs for generated/attached images */
  imageParts?: string[];
  /** Time-tool result; when present, the message renders a clock widget */
  clockData?: { timezone: string | null } | null;
  /** compose_email result; when present, the message renders an email composer */
  emailDraft?: {
    to: string;
    cc: string;
    subject: string;
    body: string;
  } | null;
  isImported?: boolean;
  isStreaming?: boolean;
  onRetry?: () => void;
  /** Provided for user messages — saves an edited prompt and re-generates */
  onEdit?: (newContent: string) => void;
  onSwitchModel?: (modelId: string) => void;
  modelOptionsByProvider?: Record<
    string,
    Array<{
      id: string;
      name: string;
      provider: string;
      disabled?: boolean;
    }>
  >;
  currentModelId?: string;
}

interface ImportedContextProps {
  provider: string;
  sourceUrl?: string;
  importedAt: number;
  messageCount: number;
}

export type { ChatInputProps, ChatMessageProps, ImportedContextProps };
