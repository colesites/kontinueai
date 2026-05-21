import { ExternalLink } from "lucide-react";
import React from "react";

// Pill-style link component
export function PillLink({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  let domain = "";
  
  try {
    if (href) {
      const url = new URL(href);
      domain = url.hostname.replace("www.", "");
    }
  } catch {
    // Invalid URL, just use the href as-is
  }

  const displayText = children;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full transition-colors no-underline hover:no-underline"
    >
      <ExternalLink size={10} className="shrink-0" />
      <span className="truncate max-w-[150px]">
        {typeof displayText === "string" && displayText.startsWith("http")
          ? domain || displayText
          : displayText}
      </span>
    </a>
  );
}
