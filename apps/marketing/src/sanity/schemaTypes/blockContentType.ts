import { ImageIcon, LinkIcon } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

/**
 * Rich text body for posts. Models content, not presentation.
 */
export const blockContentType = defineType({
	name: "blockContent",
	title: "Block Content",
	type: "array",
	of: [
		defineArrayMember({
			type: "block",
			styles: [
				{ title: "Normal", value: "normal" },
				{ title: "Heading 2", value: "h2" },
				{ title: "Heading 3", value: "h3" },
				{ title: "Heading 4", value: "h4" },
				{ title: "Quote", value: "blockquote" },
			],
			lists: [
				{ title: "Bullet", value: "bullet" },
				{ title: "Numbered", value: "number" },
			],
			marks: {
				decorators: [
					{ title: "Strong", value: "strong" },
					{ title: "Emphasis", value: "em" },
					{ title: "Code", value: "code" },
				],
				annotations: [
					defineArrayMember({
						name: "link",
						type: "object",
						title: "Link",
						icon: LinkIcon,
						fields: [
							defineField({
								name: "href",
								type: "url",
								title: "URL",
								validation: (rule) =>
									rule.uri({ scheme: ["http", "https", "mailto", "tel"] }),
							}),
						],
					}),
				],
			},
		}),
		defineArrayMember({
			type: "image",
			icon: ImageIcon,
			options: { hotspot: true },
			fields: [
				defineField({ name: "alt", type: "string", title: "Alt text" }),
				defineField({ name: "caption", type: "string", title: "Caption" }),
			],
		}),
	],
});
