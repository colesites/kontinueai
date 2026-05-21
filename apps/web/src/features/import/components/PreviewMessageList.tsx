import { cn } from "@repo/ui/lib/utils";
import { NormalizedMessage } from "../types";

export function PreviewMessageList({
  messages,
  messageCount,
}: {
  messages: NormalizedMessage[];
  messageCount: number;
}) {
  return (
    <div className="px-4 py-3 border-t border-border bg-muted/50 max-h-48 overflow-y-auto">
      <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">
        Preview
      </p>
      <div className="space-y-3">
        {messages.slice(0, 3).map((msg, i) => (
          <div key={i} className="flex items-start gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs",
                msg.role === "user"
                  ? "bg-primary/20 text-primary"
                  : "bg-primary/20 text-primary"
              )}
            >
              {msg.role === "user" ? "U" : "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">
                {msg.role === "user" ? "User" : "Assistant"}
              </p>
              <p className="text-sm text-foreground/80 line-clamp-2">
                {msg.content}
              </p>
            </div>
          </div>
        ))}
        {messages.length > 3 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            +{messageCount - 3} more messages
          </p>
        )}
      </div>
    </div>
  );
}
