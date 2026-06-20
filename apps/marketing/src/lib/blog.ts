import type { PortableTextBlock } from "next-sanity";

export function formatDate(value?: string): string {
	if (!value) return "";
	return new Date(value).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function blocksToPlainText(blocks: PortableTextBlock[]): string {
	return blocks
		.map((block) => {
			if (block._type !== "block" || !Array.isArray(block.children)) return "";
			return block.children
				.map((child) =>
					typeof (child as { text?: unknown }).text === "string"
						? (child as { text: string }).text
						: "",
				)
				.join("");
		})
		.join(" ");
}

/** Estimated minutes to read, at ~200 wpm. */
export function readingTime(blocks?: PortableTextBlock[]): number {
	if (!blocks?.length) return 1;
	const words = blocksToPlainText(blocks).trim().split(/\s+/).filter(Boolean);
	return Math.max(1, Math.round(words.length / 200));
}
