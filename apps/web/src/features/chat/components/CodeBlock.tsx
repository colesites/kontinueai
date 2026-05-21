import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { extractTextFromChildren } from "../lib/extractTextFromChildren";
import { cn } from "@repo/ui/lib/utils";

export default function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";

  const handleCopy = useCallback(async () => {
    // Extract text content from children
    const text = extractTextFromChildren(children);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group/code my-3">
      {/* Header bar with language and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700 rounded-t-lg">
        <span className="text-xs text-zinc-400 font-mono select-none uppercase">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <pre className="mt-0! rounded-t-none! bg-zinc-900 overflow-x-auto text-[0.95em]">
        <code className={cn(className, "block px-4 py-3")}>{children}</code>
      </pre>
    </div>
  );
}