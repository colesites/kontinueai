import { MessageSquare } from "lucide-react";

// Placeholder recent chats — wire to real data later.
const chats: { title: string; when: string }[] = [
  { title: "Plan the auth flow", when: "2h" },
  { title: "Refactor sidebar layout", when: "1d" },
  { title: "Review PR #214", when: "3d" },
];

const LeftSidebarChats = () => {
  return (
    <section className="min-h-0 flex-1">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
        Chats
      </p>

      {chats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/[0.07] px-3 py-6 text-center text-[12px] text-foreground/35">
          No chats yet
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {chats.map((c) => (
            <button
              key={c.title}
              type="button"
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-foreground/65 transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <MessageSquare
                size={13}
                className="shrink-0 text-foreground/30 group-hover:text-foreground/60"
              />
              <span className="flex-1 truncate">{c.title}</span>
              <span className="shrink-0 text-[10px] text-foreground/25 group-hover:text-foreground/40">
                {c.when}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default LeftSidebarChats;
