import type { Element, ElementContent } from "hast";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import { createContext, memo, useContext, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";
import { PillLink } from "./PillLink";

// Models often drop logo/favicon images into the middle of a sentence
// (e.g. `![LinkedIn](.../logo.png)` next to a citation). Rendering those as
// full-width blocks tears the paragraph apart, so images that share a
// paragraph with real text are rendered as a small inline chip instead.
const InlineImageContext = createContext(false);

function paragraphHasInlineImage(node: Element | undefined): boolean {
	const children = node?.children ?? [];
	const isImage = (child: ElementContent) =>
		child.type === "element" && child.tagName === "img";
	const hasText = children.some(
		(child) =>
			(child.type === "text" && child.value.trim().length > 0) ||
			(child.type === "element" && child.tagName !== "img"),
	);
	return hasText && children.some(isImage);
}

function MarkdownImage({ src, alt }: { src: string; alt: string }) {
	const inline = useContext(InlineImageContext);
	const [failed, setFailed] = useState(false);

	// A broken image renders as its bare alt text, which for imported chats reads
	// like something the speaker typed ("Uploaded an image"). Say what it is.
	if (failed) {
		return (
			<span className="my-1 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
				<ImageOff size={12} className="shrink-0" />
				<span>{alt?.trim() || "Image"} (unavailable)</span>
			</span>
		);
	}

	if (inline) {
		return (
			<span className="mx-0.5 inline-flex max-w-[180px] items-center gap-1 align-middle rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-xs">
				<Image
					src={src}
					alt=""
					width={14}
					height={14}
					unoptimized
					referrerPolicy="no-referrer"
					loading="lazy"
					onError={() => setFailed(true)}
					className="size-3.5 shrink-0 rounded-full object-contain"
				/>
				{alt ? <span className="truncate">{alt}</span> : null}
			</span>
		);
	}

	return (
		<Image
			src={src}
			alt={alt}
			width={800}
			height={600}
			unoptimized
			referrerPolicy="no-referrer"
			loading="lazy"
			onError={() => setFailed(true)}
			className="my-2 max-h-96 max-w-full rounded-lg border border-border/60"
		/>
	);
}

interface MessageContentProps {
	content: string;
	isStreaming?: boolean;
}

export const MessageContent = memo(function MessageContent({
	content,
	isStreaming,
}: MessageContentProps) {
	return (
		<>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				rehypePlugins={[rehypeHighlight]}
				components={{
					p: ({ children, node, ...props }) => (
						<InlineImageContext.Provider value={paragraphHasInlineImage(node)}>
							<p
								className="wrap-anywhere"
								data-testid="message-content-paragraph"
								{...props}
							>
								{children}
							</p>
						</InlineImageContext.Provider>
					),
					li: ({ children, ...props }) => (
						<li className="wrap-anywhere" {...props}>
							{children}
						</li>
					),
					table: ({ children }) => (
						<div className="my-4 w-full overflow-x-auto rounded-lg border border-border/60">
							<table className="w-max min-w-full border-collapse text-sm">
								{children}
							</table>
						</div>
					),
					th: ({ children, ...props }) => (
						<th
							className="whitespace-nowrap border border-border/60 bg-muted/40 px-3 py-2 text-left align-top font-semibold"
							{...props}
						>
							{children}
						</th>
					),
					td: ({ children, ...props }) => (
						<td
							className="border border-border/60 px-3 py-2 align-top wrap-anywhere"
							{...props}
						>
							{children}
						</td>
					),
					// Custom code block rendering with copy button
					pre: ({ children }) => {
						// children is the <code> element
						return <>{children}</>;
					},
					code: ({ className, children, ...props }) => {
						// Check if this is a code block (has language class) or inline code
						const isCodeBlock =
							className?.includes("language-") || className?.includes("hljs");

						// If it has a language, definitely a code block
						if (isCodeBlock) {
							return <CodeBlock className={className}>{children}</CodeBlock>;
						}

						// If no language, check if content has newlines - if so, treat as block
						const contentString = String(children);
						if (contentString.includes("\n")) {
							return (
								<CodeBlock className="language-text">{children}</CodeBlock>
							);
						}

						// Inline code
						return (
							<code
								className="bg-muted/70 break-all rounded px-1.5 py-0.5 font-mono text-[0.925em] text-primary"
								{...props}
							>
								{children}
							</code>
						);
					},
					// Custom link as pill
					a: ({ href, children }) => (
						<PillLink href={href}>{children}</PillLink>
					),
					// Imported images (e.g. Gemini's lh3.googleusercontent.com URLs) use
					// referrer-based hotlink protection — omit the Referer header so they
					// load instead of returning 429/403.
					img: ({ src, alt }) =>
						typeof src === "string" ? (
							<MarkdownImage src={src} alt={alt ?? ""} />
						) : null,
				}}
			>
				{content}
			</ReactMarkdown>
			{isStreaming && (
				<span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
			)}
		</>
	);
});
