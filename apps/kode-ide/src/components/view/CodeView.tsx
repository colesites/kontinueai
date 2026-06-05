import { ChatInput } from "@/components/chat/ChatInput";

const sample = [
  "export function greet(name: string) {",
  "  return `Hello, ${name}`;",
  "}",
  "",
  "const user = await getUser();",
  "console.log(greet(user.name));",
];

const CodeView = () => {
  return (
    <div className="relative h-full w-full">
      {/* Editor fills the page; the chat input floats over its lower edge */}
      <div className="absolute inset-0 px-3 pb-3 pt-16">
        <div className="glass flex h-full flex-col overflow-hidden rounded-xl">
          {/* Editor tab bar */}
          <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 py-1.5">
            <div className="surface-inset flex items-center gap-2 rounded-md px-2.5 py-1 text-[12px] text-foreground/80">
              <span className="size-1.5 rounded-full bg-brand" />
              index.ts
            </div>
            <div className="rounded-md px-2.5 py-1 text-[12px] text-foreground/40">
              utils.ts
            </div>
          </div>

          {/* Code area */}
          <div className="min-h-0 flex-1 overflow-auto px-1 pt-3 pb-32 font-mono text-[12.5px] leading-6">
            {sample.map((line, i) => (
              <div key={i} className="flex">
                <span className="w-10 shrink-0 select-none pr-3 text-right text-foreground/25">
                  {i + 1}
                </span>
                <span className="whitespace-pre text-foreground/80">{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Docked chat input */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-6">
        <div className="pointer-events-auto w-full max-w-3xl">
          <ChatInput placeholder="Ask the code agent to build, edit, or fix…" />
        </div>
      </div>
    </div>
  );
};

export default CodeView;
