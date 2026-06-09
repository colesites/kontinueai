import { ChatInput } from "@/components/chat/ChatInput";

const suggestions = [
  "Build a Tauri command palette",
  "Fix the file tree drag state",
  "Create a Monaco editor theme",
];

const PlanView = () => {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-[15vh]">
      {/* Hero */}
      <div className="mb-9 text-center">
        <div className="surface-inset mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase text-foreground/50">
          <span className="size-1.5 rounded-full bg-brand" />
          Agent
        </div>
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-foreground">
          What are we working on?
        </h1>
        <p className="mt-3 text-[17px] text-foreground/55">
          Ask the agent to build, edit, debug, explain, or review code.
        </p>
      </div>

      {/* Input */}
      <div className="w-full">
        <ChatInput placeholder="Ask the agent to work on your app…" />
      </div>

      {/* Suggestions */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="surface-inset rounded-full px-3.5 py-1.5 text-[12.5px] text-foreground/58 transition-all duration-200 hover:-translate-y-px hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PlanView;
