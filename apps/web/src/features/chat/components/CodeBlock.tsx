import { cn } from "@repo/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { extractTextFromChildren } from "../lib/extractTextFromChildren";

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
		<div className="relative group/code my-4 overflow-hidden rounded-xl bg-[#0d1117] ring-1 ring-white/10 shadow-[0_8px_28px_-12px_color-mix(in_oklch,black_60%,transparent)]">
			{/* Header bar with traffic dots, language and copy button */}
			<div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-white/[0.03] border-b border-white/10">
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="flex items-center gap-1.5 shrink-0" aria-hidden>
						<span className="size-2.5 rounded-full bg-[#ff5f57]" />
						<span className="size-2.5 rounded-full bg-[#febc2e]" />
						<span className="size-2.5 rounded-full bg-[#28c840]" />
					</span>
					<span className="truncate text-[11px] font-mono uppercase tracking-wider text-white/45 select-none">
						{language || "code"}
					</span>
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"
				>
					{copied ? (
						<>
							<Check size={13} strokeWidth={2.5} />
							<span>Copied</span>
						</>
					) : (
						<>
							<Copy size={13} strokeWidth={2.5} />
							<span>Copy</span>
						</>
					)}
				</button>
			</div>
			{/* Code content */}
			<pre className="mt-0! rounded-none! bg-transparent overflow-x-auto text-[0.95em]">
				<code className={cn(className, "block px-4 py-3.5")}>{children}</code>
			</pre>
		</div>
	);
}
