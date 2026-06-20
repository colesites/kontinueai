import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Plus,
  ImageIcon,
  Blocks,
  Mic,
  ChevronDown,
  Check,
  Square,
} from "lucide-react";
import { KODE_DEFAULT_MODEL_ID, KODE_MODELS } from "@repo/ai/lib/kode";
import type { KodePlanTier } from "@repo/ai/lib/kode";
import {
  KODE_AGENT_MODES,
  type KodeAgentMode,
} from "@/lib/kode-tools";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import type { FileUIPart } from "ai";
import { cn } from "@/lib/utils";

// An attachment staged in the input: a file part (image or text) + extracted
// text for text files (sent to the model as context; images go as image_url).
export type StagedAttachment = FileUIPart & { id: string; text?: string };

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const MODEL_ICON_BY_PROVIDER: Partial<Record<string, string>> = {
  kontinue: "/kontinueai-icon.png",
  minimax: "/minimax.svg",
  zai: "/zai.svg",
  deepseek: "/deepseek.svg",
  xai: "/grok.svg",
  alibaba: "/qwen.svg",
  anthropic: "/claude-ai.svg",
  google: "/gemini.svg",
  openai: "/openai.svg",
};

const PLAN_RANK: Record<KodePlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

type ChatInputProps = {
  // `loading` reflects only THIS chat's in-flight send. The textarea stays
  // editable so the user can keep working (and switch to other chats).
  loading?: boolean;
  // Abort the in-flight run for this chat (turns the send button into Stop).
  onStop?: () => void;
  modelId?: string;
  onModelChange?: (modelId: string) => void;
  onSend?: (
    text: string,
    modelId: string,
    attachments?: StagedAttachment[],
  ) => void;
  placeholder?: string;
  planTier?: KodePlanTier;
  // Agent permission mode (Ask / Auto / Plan / Design).
  mode?: KodeAgentMode;
  onModeChange?: (mode: KodeAgentMode) => void;
  // Seed text into the input (e.g. when rewinding a message). The nonce lets the
  // same text be re-seeded.
  seedText?: string;
  seedNonce?: number;
};

export function ChatInput({
  loading = false,
  onStop,
  modelId: controlledModelId,
  onModelChange,
  placeholder = "Describe what you want to build…",
  onSend,
  planTier = "free",
  mode = "ask",
  onModeChange,
  seedText = "",
  seedNonce = 0,
}: ChatInputProps) {
  const activeMode =
    KODE_AGENT_MODES.find((m) => m.id === mode) ?? KODE_AGENT_MODES[0];
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [uncontrolledModelId, setUncontrolledModelId] =
    useState(KODE_DEFAULT_MODEL_ID);
  const modelId = controlledModelId ?? uncontrolledModelId;
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const staged: StagedAttachment[] = [];
    for (const file of Array.from(files)) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const mediaType = file.type || "application/octet-stream";
      if (mediaType.startsWith("image/")) {
        staged.push({
          type: "file",
          id,
          mediaType,
          filename: file.name,
          url: await readAsDataURL(file),
        });
      } else {
        // Text-like file: keep its text to send to the model as context.
        const text = await readAsText(file).catch(() => "");
        staged.push({
          type: "file",
          id,
          mediaType: mediaType.startsWith("text/") ? mediaType : "text/plain",
          filename: file.name,
          url: "",
          text,
        });
      }
    }
    setAttachments((current) => [...current, ...staged]);
  };
  const selectedModel =
    KODE_MODELS.find((model) => model.id === modelId) ?? KODE_MODELS[0];

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  };

  useEffect(() => {
    if (seedNonce > 0) {
      setValue(seedText);
      requestAnimationFrame(() => {
        ref.current?.focus();
        resize();
      });
    }
    // Re-run only when a new seed is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  const submit = () => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || loading) return;
    onSend?.(text, modelId, attachments.length > 0 ? attachments : undefined);
    setValue("");
    setAttachments([]);
    requestAnimationFrame(resize);
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;
  const setModel = (nextModelId: string) => {
    setUncontrolledModelId(nextModelId);
    onModelChange?.(nextModelId);
  };

  return (
    <div
      className="glass-strong rounded-2xl p-3 transition-colors duration-150
        focus-within:border-[color-mix(in_oklch,var(--brand)_44%,transparent)] focus-within:shadow-[inset_0_1px_0_oklch(1_0_0/0.1),0_0_0_1px_var(--brand-soft),0_34px_80px_-26px_oklch(0_0_0/0.9)]"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,text/*,.md,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.rs,.go,.java,.yml,.yaml,.toml"
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {attachments.length > 0 ? (
        <Attachments variant="inline" className="mb-2 px-1">
          {attachments.map((att) => (
            <Attachment
              key={att.id}
              data={att}
              onRemove={() =>
                setAttachments((cur) => cur.filter((a) => a.id !== att.id))
              }
            >
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      ) : null}

      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Message Kode"
        className="min-h-[60px] max-h-[260px] w-full resize-none bg-transparent px-2 pt-1 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
      />

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {/* Left: model + tools */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Selected model: ${selectedModel?.name ?? "Kode 1.0"}`}
                className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/68 transition-colors hover:text-foreground"
              >
                {selectedModel && (
                  <ModelIcon
                    provider={selectedModel.provider}
                    className="size-4"
                  />
                )}
                <span>{selectedModel?.name ?? "Kode 1.0"}</span>
                <ChevronDown size={12} className="text-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-72 rounded-2xl border border-white/[0.08] bg-[oklch(0.17_0.004_260)] p-1.5"
            >
              {KODE_MODELS.map((modelOption) => {
                const minimumPlan = modelOption.minimumPlan as
                  | KodePlanTier
                  | undefined;
                const locked =
                  minimumPlan !== undefined &&
                  PLAN_RANK[planTier] < PLAN_RANK[minimumPlan];

                return (
                  <DropdownMenuItem
                    key={modelOption.id}
                    disabled={locked}
                    onClick={() => {
                      if (!locked) setModel(modelOption.id);
                    }}
                    className="gap-2.5 rounded-xl px-2.5 py-2 text-[13px] data-disabled:opacity-45"
                  >
                    <ModelIcon provider={modelOption.provider} />
                    <span className="min-w-0 flex-1 truncate">
                      {modelOption.name}
                    </span>
                    {locked ? (
                      <span className="rounded-md border border-brand/20 bg-brand/10 px-1.5 py-0.5 text-[10px] uppercase text-brand/75">
                        {minimumPlan}
                      </span>
                    ) : null}
                    <Check
                      size={14}
                      className={
                        modelOption.id === modelId
                          ? "opacity-100 text-brand"
                          : "opacity-0"
                      }
                    />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Agent mode: ${activeMode?.label}`}
                className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/68 transition-colors hover:text-foreground"
              >
                <span>{activeMode?.label}</span>
                <ChevronDown size={12} className="text-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-60 rounded-2xl border border-white/[0.08] bg-[oklch(0.17_0.004_260)] p-1.5"
            >
              {KODE_AGENT_MODES.map((modeOption) => (
                <DropdownMenuItem
                  key={modeOption.id}
                  disabled={modeOption.disabled}
                  onClick={() => {
                    if (!modeOption.disabled) onModeChange?.(modeOption.id);
                  }}
                  className="flex-col items-start gap-0.5 rounded-xl px-2.5 py-2 text-[13px] data-disabled:opacity-45"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {modeOption.label}
                    </span>
                    <Check
                      size={14}
                      className={
                        modeOption.id === mode
                          ? "opacity-100 text-brand"
                          : "opacity-0"
                      }
                    />
                  </div>
                  <span className="text-[11px] text-foreground/45">
                    {modeOption.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add to chat"
                className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.055] hover:text-foreground/85"
              >
                <Plus size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 rounded-2xl border border-white/[0.08] bg-[oklch(0.17_0.004_260)] p-1.5"
            >
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
                className="gap-2.5 rounded-xl px-2.5 py-2 text-[13px]"
              >
                <ImageIcon size={15} className="text-foreground/60" />
                Add files or photos
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled
                className="gap-2.5 rounded-xl px-2.5 py-2 text-[13px] data-disabled:opacity-45"
              >
                <Blocks size={15} className="text-foreground/60" />
                Connectors
                <span className="ml-auto text-[10px] uppercase text-foreground/35">
                  soon
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: dictate + send */}
        <div className="flex items-center gap-1.5">
          <ToolButton label="Dictate">
            <Mic size={15} />
          </ToolButton>
          <button
            type="button"
            onClick={loading ? onStop : submit}
            disabled={loading ? !onStop : !canSend}
            aria-label={loading ? "Stop" : "Send"}
            className="surface-raised flex size-8 items-center justify-center rounded-lg text-foreground transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30
              enabled:hover:bg-white/[0.07] enabled:active:scale-95"
          >
            {loading ? (
              <Square
                size={13}
                strokeWidth={2.5}
                className="fill-current text-brand"
              />
            ) : (
              <ArrowUp size={16} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const icon = MODEL_ICON_BY_PROVIDER[provider];

  if (icon) {
    return (
      <span className={cn("grid size-5 shrink-0 place-items-center", className)}>
        <img
          src={icon}
          alt=""
          className={cn(
            "size-4 object-contain",
            provider === "kontinue" && "brightness-0 invert",
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.06] font-semibold text-[9px] text-foreground/70 ring-1 ring-white/[0.08]",
        className,
      )}
      aria-hidden="true"
    >
      {provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ToolButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.055] hover:text-foreground/85"
    >
      {children}
    </button>
  );
}

export default ChatInput;
