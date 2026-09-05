import type { Element, ElementContent } from "hast";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import { createContext, memo, useContext, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";
import { ImageLightbox } from "./ImageLightbox";
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

// Search citations arrive as a site icon plus a label, sometimes on their own
// line. Sized as content they blow up into a full-width logo; ChatGPT renders
// the same thing as a small chip beside the sentence, which is what these are.
const CITATION_ICON_SRC_REGEX =
	/(?:favicon|apple-touch-icon|\/s2\/favicons|[/_-](?:icon|logo)s?[/_.-])|\.ico(?:$|\?)/i;
// A citation label carrying a source count, e.g. "Resend+1", "LinkedIn +2".
const CITATION_COUNT_ALT_REGEX = /\s*\+\d+\s*$/;
// A citation labelled with the bare source domain, e.g. "en.wikipedia.org".
// A filename ("photo.png") has the same shape and must not match.
const DOMAIN_ALT_REGEX = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const FILE_EXTENSION_ALT_REGEX =
	/\.(?:png|jpe?g|gif|webp|heic|svg|pdf|csv|xlsx?|docx?|txt|md|zip|json)$/i;
// How share pages label an upload ("Uploaded image preview", "Screenshot…").
const ATTACHMENT_ALT_REGEX =
	/\b(?:upload|attach|screenshot|photo|picture|preview)/i;
// Anything this small is chrome, not content, whatever the markdown claims.
const ICON_MAX_NATURAL_PX = 64;
// Site icons are square and ship at up to 512px (Wikipedia's is one of those).
// Generated and attached images never reach this component — they render
// through ChatMessageImages — so a square image with a label-sized alt here is
// a source icon, not content.
const SQUARE_ICON_MAX_NATURAL_PX = 512;
const ICON_ALT_MAX_CHARS = 40;

function isCitationIcon(src: string, alt: string): boolean {
	return (
		CITATION_ICON_SRC_REGEX.test(src) ||
		CITATION_COUNT_ALT_REGEX.test(alt) ||
		(DOMAIN_ALT_REGEX.test(alt.trim()) &&
			!FILE_EXTENSION_ALT_REGEX.test(alt.trim()))
	);
}

function isMeasuredIcon(image: HTMLImageElement, alt: string): boolean {
	const { naturalWidth: width, naturalHeight: height } = image;
	if (width <= 0 || height <= 0) return false;
	if (width <= ICON_MAX_NATURAL_PX && height <= ICON_MAX_NATURAL_PX) {
		return true;
	}
	const isSquare = Math.abs(width - height) <= 2;
	return (
		isSquare &&
		width <= SQUARE_ICON_MAX_NATURAL_PX &&
		alt.trim().length <= ICON_ALT_MAX_CHARS
	);
}

function MarkdownImage({ src, alt }: { src: string; alt: string }) {
	const inlineInParagraph = useContext(InlineImageContext);
	const [failed, setFailed] = useState(false);
	// Measured on load, so an icon we can't recognise from its URL still shrinks.
	const [measuredIcon, setMeasuredIcon] = useState(false);
	const [expanded, setExpanded] = useState(false);
	// An attachment (alt is a filename) is a picture wherever it sits; only
	// citation-shaped images get the inline chip treatment.
	const isAttachment =
		FILE_EXTENSION_ALT_REGEX.test(alt.trim()) || ATTACHMENT_ALT_REGEX.test(alt);
	const inline =
		!isAttachment &&
		(inlineInParagraph || measuredIcon || isCitationIcon(src, alt));

	// A broken image renders as its bare alt text, which for imported chats reads
	// like something the speaker typed ("Uploaded an image"). Say what it is.
	if (failed) {
		return (
			<span className="not-prose mx-[0.15em] inline-flex items-center gap-[0.3em] rounded-full bg-muted/70 px-[0.5em] py-[0.15em] align-[-0.15em] text-[0.8em] leading-none text-muted-foreground">
				<ImageOff className="size-[1.1em] shrink-0" />
				<span className="truncate">{alt?.trim() || "Image"} unavailable</span>
			</span>
		);
	}

	const icon = (
		<Image
			src={src}
			alt=""
			width={16}
			height={16}
			unoptimized
			referrerPolicy="no-referrer"
			loading="lazy"
			onError={() => setFailed(true)}
			className="size-[1.1em] shrink-0 rounded-[0.2em] object-contain"
		/>
	);

	if (inline) {
		return (
			<span className="not-prose mx-[0.15em] inline-flex max-w-[16em] items-center gap-[0.3em] rounded-full bg-muted/70 px-[0.5em] py-[0.15em] align-[-0.15em] text-[0.8em] font-medium leading-none text-muted-foreground">
				{icon}
				{alt ? <span className="truncate">{alt}</span> : null}
			</span>
		);
	}

	// A content image (an import's screenshot, say) expands and downloads the
	// same way a generated image does.
	return (
		<>
			<button
				type="button"
				onClick={() => setExpanded(true)}
				title="Expand image"
				className="not-prose my-2 block w-fit max-w-full cursor-zoom-in rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
			>
				<Image
					src={src}
					alt={alt}
					width={800}
					height={600}
					unoptimized
					referrerPolicy="no-referrer"
					loading="lazy"
					onError={() => setFailed(true)}
					onLoad={(event) => {
						if (isMeasuredIcon(event.currentTarget, alt)) {
							setMeasuredIcon(true);
						}
					}}
					// `h-auto w-auto` keeps the intrinsic size: the 800x600 above is only
					// next/image's required placeholder, and without this a 32px favicon is
					// stretched to fill the message column.
					className="h-auto w-auto max-h-96 max-w-full rounded-lg border border-border/60"
				/>
			</button>
			{expanded && (
				<ImageLightbox
					src={src}
					alt={alt}
					downloadName={alt.trim() || "image"}
					onClose={() => setExpanded(false)}
				/>
			)}
		</>
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
