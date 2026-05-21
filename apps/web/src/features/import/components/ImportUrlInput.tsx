import { Link2 } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { PROVIDER_CONFIG, Provider } from "@repo/utils/url-safety";

export function ImportUrlInput({
  url,
  provider,
  isProcessing,
  handleUrlChange,
  handleCreateChat,
}: {
  url: string;
  provider: Provider | null;
  isProcessing: boolean;
  handleUrlChange: (value: string) => void;
  handleCreateChat: () => void;
}) {
  return (
    <div className="relative flex-1 w-full">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
        <Link2 size={20} />
      </div>
      <input
        type="url"
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        placeholder="Paste shared link (optional)..."
        disabled={isProcessing}
        className={cn(
          "w-full pl-12 pr-4 py-4 rounded-xl bg-background border text-foreground placeholder:text-muted-foreground placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all",
          provider && provider !== "unknown"
            ? "border-primary/50"
            : "border-input"
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isProcessing) {
            handleCreateChat();
          }
        }}
      />
      {provider && provider !== "unknown" && (
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-medium"
          style={{
            backgroundColor: `${PROVIDER_CONFIG[provider].color}20`,
            color: PROVIDER_CONFIG[provider].color,
          }}
        >
          {PROVIDER_CONFIG[provider].name}
        </div>
      )}
    </div>
  );
}
