import { useRef, useState } from "react";
import {
  ArrowUp,
  Paperclip,
  AtSign,
  Mic,
  ChevronDown,
  Sparkles,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const MODELS = ["K-AI 1.0", "GPT-5.5", "Claude Sonnet 4.6", "Gemini 3 Pro"];

type ChatInputProps = {
  placeholder?: string;
  onSend?: (text: string) => void;
};

export function ChatInput({
  placeholder = "Describe what you want to build…",
  onSend,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend?.(text);
    setValue("");
    requestAnimationFrame(resize);
  };

  const canSend = value.trim().length > 0;

  return (
    <div
      className="glass-strong rounded-2xl p-3 transition-colors duration-150
        focus-within:border-[color-mix(in_oklch,var(--brand)_44%,transparent)] focus-within:shadow-[inset_0_1px_0_oklch(1_0_0/0.1),0_0_0_1px_oklch(0.71_0.11_246/0.18),0_34px_80px_-26px_oklch(0_0_0/0.9)]"
    >
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
        className="min-h-[60px] max-h-[260px] w-full resize-none bg-transparent px-2 pt-1 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/35 focus:outline-none"
      />

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {/* Left: model + tools */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/62 transition-colors hover:text-foreground"
              >
                <Sparkles size={13} />
                <span>{model}</span>
                <ChevronDown size={12} className="text-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {MODELS.map((m) => (
                <DropdownMenuItem
                  key={m}
                  onClick={() => setModel(m)}
                  className="gap-2 text-[13px]"
                >
                  <Check
                    size={14}
                    className={m === model ? "opacity-100 text-brand" : "opacity-0"}
                  />
                  {m}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolButton label="Attach">
            <Paperclip size={15} />
          </ToolButton>
          <ToolButton label="Mention context">
            <AtSign size={15} />
          </ToolButton>
        </div>

        {/* Right: dictate + send */}
        <div className="flex items-center gap-1.5">
          <ToolButton label="Dictate">
            <Mic size={15} />
          </ToolButton>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send"
            className="surface-raised flex size-8 items-center justify-center rounded-lg text-foreground transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30
              enabled:hover:bg-white/[0.07] enabled:active:scale-95"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
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
