import type { PortableTextBlock } from "next-sanity";

export interface TOCItem {
	title: string;
	id: string;
	level: number;
}

export function slugify(text: string): string {
	return text
		.toString()
		.toLowerCase()
		.normalize("NFD")
		.trim()
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, "-")
		.replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-");
}

export function extractHeadings(blocks: PortableTextBlock[] = []): TOCItem[] {
	const headings: TOCItem[] = [];

	for (const block of blocks) {
		if (
			block._type === "block" &&
			block.style &&
			["h2", "h3"].includes(block.style)
		) {
			const text = block.children
				?.map((child: { _type?: string; text?: string }) => child.text || "")
				.join("") || "";
			
			if (text) {
				headings.push({
					title: text,
					id: slugify(text),
					level: parseInt(block.style.replace("h", ""), 10),
				});
			}
		}
	}

	return headings;
}
