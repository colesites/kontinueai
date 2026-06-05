import { ChatInput } from "@/components/chat/ChatInput";

const DesignView = () => {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Canvas surface with a subtle dot grid (Figma-style) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(oklch(1 0 0 / 0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {/* Placeholder artboard floating on the canvas */}
        <div className="flex h-full w-full items-center justify-center">
          <div className="glass w-[420px] max-w-[80%] rounded-xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <span className="text-[12px] font-medium text-foreground/60">
                Untitled frame
              </span>
              <span className="text-[11px] text-foreground/35">1440 × 1024</span>
            </div>
            <div className="flex h-56 items-center justify-center text-[13px] text-foreground/30">
              Your design appears here
            </div>
          </div>
        </div>
      </div>

      {/* Docked chat input */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-6">
        <div className="pointer-events-auto w-full max-w-3xl">
          <ChatInput placeholder="Describe the screen or component to design…" />
        </div>
      </div>
    </div>
  );
};

export default DesignView;
