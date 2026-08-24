import { useState, useEffect } from "react";
import { Search, X, MessageSquare } from "lucide-react";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { formatWhen } from "@/components/layout/sidebar/SidebarChatRow";

type SearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const { chats, selectChat } = useKodeWorkspace();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const filteredChats = chats.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/[0.1] bg-popover/90 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Search Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
          <Search size={15} strokeWidth={1.5} className="text-[#8e8e93] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats and projects"
            className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#8e8e93]"
            autoFocus
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-lg text-[#8e8e93] hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Results List Area */}
        <div className="p-2 max-h-[60vh] overflow-y-auto space-y-0.5">
          {filteredChats.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8e8e93]">
              No matching chats or projects found
            </div>
          ) : (
            filteredChats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  selectChat(c.id);
                  onOpenChange(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 h-[26px] text-left transition-colors hover:bg-black/60 group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare
                    size={13.5}
                    strokeWidth={1.25}
                    className="shrink-0 text-[#8e8e93] group-hover:text-white"
                  />
                  <span className="truncate text-[12px] font-normal text-[#d1d1d6] group-hover:text-white">
                    {c.title}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] text-[#7c7c82]">
                  {formatWhen(c.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
