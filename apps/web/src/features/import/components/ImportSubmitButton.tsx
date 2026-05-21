import { Loader2, Plus } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

export function ImportSubmitButton({
  isProcessing,
  isStartingBlank,
  hasUrl,
  handleCreateChat,
}: {
  isProcessing: boolean;
  isStartingBlank: boolean;
  hasUrl: boolean;
  handleCreateChat: () => void;
}) {
  return (
    <button
      onClick={handleCreateChat}
      disabled={isProcessing}
      className={cn(
        "w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-semibold transition-all shadow-lg",
        !isProcessing
          ? "bg-primary hover:bg-primary/90 text-primary-foreground"
          : "bg-muted text-muted-foreground cursor-not-allowed"
      )}
    >
      {isProcessing ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          {isStartingBlank ? "Starting Chat..." : "Importing..."}
        </>
      ) : (
        <>
          {hasUrl ? (
            <>Import Chat</>
          ) : (
            <>
              <Plus size={18} />
              Start Blank Chat
            </>
          )}
        </>
      )}
    </button>
  );
}
