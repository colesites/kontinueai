import { ExternalLink } from "lucide-react";
import type React from "react";
import { Children, isValidElement } from "react";

// react-markdown hands `a` its already-rendered children, so the icon of a
// `[![Label](icon)](url)` citation arrives as an element carrying an image
// `src` — and the only label the link has is that image's alt text.
function readIconChild(
	children: React.ReactNode,
): { src: string; alt: string } | null {
	for (const child of Children.toArray(children)) {
		if (!isValidElement(child)) continue;
		const props = child.props as { src?: unknown; alt?: unknown };
		if (typeof props?.src === "string") {
			return {
				src: props.src,
				alt: typeof props.alt === "string" ? props.alt : "",
			};
		}
	}
	return null;
}

// `not-prose` matters: the chat wraps messages in Tailwind Typography, which
// gives every `img` a 2em vertical margin. Inside a chip that inflates the pill
// to roughly three times the line height.
//
// A source citation renders as one chip sized to the text around it: a site
// icon (or a generic arrow) plus a label, one line tall. Every dimension is in
// `em` so the chip tracks the font size of its paragraph instead of fighting it.
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

	const icon = readIconChild(children);

	// Models emit citations three ways: `[Label](url)`, a bare `[](url)`, and
	// `[![Label](icon)](url)` whose only label is the icon's alt. All three
	// should end up as one chip with a readable name on it.
	const isEmpty =
		children === null ||
		children === undefined ||
		children === false ||
		(typeof children === "string" && children.trim() === "");
	const label = icon
		? icon.alt.trim() || domain || href
		: isEmpty
			? domain || href
			: children;

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="not-prose mx-[0.15em] inline-flex max-w-[16em] items-center gap-[0.3em] rounded-full bg-muted/70 px-[0.5em] py-[0.15em] align-[-0.15em] text-[0.8em] font-medium leading-none text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground hover:no-underline"
		>
			{icon ? (
				// Rendered here rather than by the image component so the markup does
				// not depend on render-time context, which desynced SSR from hydration.
				// biome-ignore lint/performance/noImgElement: a favicon needs no optimizer
				<img
					src={icon.src}
					alt=""
					loading="lazy"
					referrerPolicy="no-referrer"
					className="size-[1.1em] shrink-0 rounded-[0.2em] object-contain"
				/>
			) : (
				<ExternalLink className="size-[1em] shrink-0" strokeWidth={2.25} />
			)}
			<span className="truncate">
				{typeof label === "string" && label.startsWith("http")
					? domain || label
					: label}
			</span>
		</a>
	);
}
