import { ChatInput } from "@/components/chat/ChatInput";

const suggestions = [
  "Plan a REST API for a notes app",
  "Outline a migration from REST to tRPC",
  "Break down a real-time chat feature",
];

const PlanView = () => {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-[16vh]">
      {/* Hero */}
      <div className="mb-8 text-center">
        <div className="surface-inset mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">
          <span className="size-1.5 rounded-full bg-brand" />
          Plan
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
          What should we build?
        </h1>
        <p className="mt-2 text-[14px] text-foreground/45">
          Start with a plan. Kontinue takes it from idea → design → code → review.
        </p>
      </div>

      {/* Input */}
      <div className="w-full">
        <ChatInput placeholder="Describe the feature, bug, or idea…" />
      </div>

      {/* Suggestions */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="surface-inset rounded-full px-3.5 py-1.5 text-[12.5px] text-foreground/55 transition-all duration-200 hover:scale-[1.02] hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PlanView;
