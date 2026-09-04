import { ExternalLink } from "lucide-react";
import type React from "react";

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

	// Models sometimes emit a bare `[](url)`, which would render as a lone icon
	// with no indication of where it goes — fall back to the domain.
	const isEmpty =
		children === null ||
		children === undefined ||
		children === false ||
		(typeof children === "string" && children.trim() === "");
	const displayText = isEmpty ? domain || href : children;

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
