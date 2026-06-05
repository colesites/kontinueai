import { useRef, useState } from "react";
import {
  ArrowUp,
  Paperclip,
  AtSign,
  Mic,
  ChevronDown,
  Telescope,
  PenTool,
  Code2,
  CircleCheck,
  Sparkles,
  Check,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAppTab, type AppTab } from "@/components/layout/tab-context";

const AGENTS: { tab: AppTab; label: string; icon: LucideIcon; desc: string }[] =
  [
    { tab: "plan", label: "Plan agent", icon: Telescope, desc: "Scope & break down work" },
    { tab: "design", label: "Design agent", icon: PenTool, desc: "Design the UI on canvas" },
    { tab: "code", label: "Code agent", icon: Code2, desc: "Write & edit the code" },
    { tab: "review", label: "Review agent", icon: CircleCheck, desc: "Review & refine" },
  ];

const MODELS = ["K-AI 1.0", "GPT-5.5", "Claude Sonnet 4.6", "Gemini 3 Pro"];

type ChatInputProps = {
  placeholder?: string;
  onSend?: (text: string) => void;
};

export function ChatInput({
  placeholder = "Describe what you want to build…",
  onSend,
}: ChatInputProps) {
  const { activeTab, setActiveTab } = useAppTab();
  const [value, setValue] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const ref = useRef<HTMLTextAreaElement>(null);

  const agent = AGENTS.find((a) => a.tab === activeTab) ?? AGENTS[0];
  const AgentIcon = agent.icon;

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
      className="glass-strong rounded-[20px] p-3 transition-colors duration-150
        focus-within:border-[color-mix(in_oklch,var(--brand)_40%,transparent)]"
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
        {/* Left: agent + model + tools */}
        <div className="flex items-center gap-1">
          {/* Agent selector → switches the active view */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="surface-inset flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                <AgentIcon size={14} className="text-brand" />
                <span>{agent.label}</span>
                <ChevronDown size={13} className="text-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {AGENTS.map((a) => {
                const Icon = a.icon;
                const active = a.tab === activeTab;
                return (
                  <DropdownMenuItem
                    key={a.tab}
                    onClick={() => setActiveTab(a.tab)}
                    className="gap-2.5 py-2"
                  >
                    <Icon
                      size={15}
                      className={active ? "text-brand" : "text-foreground/50"}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium">{a.label}</span>
                      <span className="text-[11px] text-foreground/45">
                        {a.desc}
                      </span>
                    </div>
                    {active && <Check size={14} className="ml-auto text-brand" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Model selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-foreground/55 transition-colors hover:bg-white/[0.05] hover:text-foreground"
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
            className="bg-brand flex size-8 items-center justify-center rounded-lg text-white transition-all duration-150
              disabled:cursor-not-allowed disabled:opacity-30 disabled:saturate-0
              ring-1 ring-[color-mix(in_oklch,var(--brand)_55%,transparent)]
              enabled:hover:brightness-105 enabled:active:scale-95"
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
      className="flex size-8 items-center justify-center rounded-lg text-foreground/45 transition-colors hover:bg-white/[0.05] hover:text-foreground"
    >
      {children}
    </button>
  );
}

export default ChatInput;
