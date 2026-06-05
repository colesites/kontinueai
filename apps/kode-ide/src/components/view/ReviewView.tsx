import { ChatInput } from "@/components/chat/ChatInput";
import { FileDiff } from "lucide-react";

const changes = [
  { file: "src/auth/login.ts", add: 42, del: 8 },
  { file: "src/components/Form.tsx", add: 15, del: 3 },
  { file: "src/lib/session.ts", add: 9, del: 0 },
];

const ReviewView = () => {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 px-3 pb-3 pt-16">
        <div className="glass h-full overflow-auto rounded-xl p-4 pb-32">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
            Changes to review
          </p>
          <div className="flex flex-col gap-1">
            {changes.map((c) => (
              <button
                key={c.file}
                type="button"
                className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
              >
                <FileDiff size={14} className="shrink-0 text-foreground/40" />
                <span className="flex-1 truncate font-mono text-[12.5px] text-foreground/80">
                  {c.file}
                </span>
                <span className="font-mono text-[11px] text-emerald-400/80">
                  +{c.add}
                </span>
                <span className="font-mono text-[11px] text-rose-400/70">
                  −{c.del}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-6">
        <div className="pointer-events-auto w-full max-w-3xl">
          <ChatInput placeholder="Ask the review agent to critique or refine…" />
        </div>
      </div>
    </div>
  );
};

export default ReviewView;
