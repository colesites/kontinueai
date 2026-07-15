import { defineField, defineType } from "sanity";

export const seoType = defineType({
	name: "seo",
	title: "SEO",
	type: "object",
	fields: [
		defineField({
			name: "title",
			title: "SEO title",
			type: "string",
			description: "Optional. The post title is used when this is empty.",
			validation: (rule) =>
				rule
					.max(65)
					.warning("Search titles are usually best under 65 characters."),
		}),
		defineField({
			name: "description",
			type: "text",
			rows: 3,
			description: "Optional. The excerpt is used when this is empty.",
			validation: (rule) =>
				rule
					.max(170)
					.warning(
						"Search descriptions are usually best under 170 characters.",
					),
		}),
		defineField({
			name: "image",
			title: "Social image",
			type: "image",
			options: { hotspot: true },
			description:
				"Optional. Recommended size: 1200 × 630 px. The cover image is cropped to that ratio when this is empty.",
			fields: [
				defineField({
					name: "alt",
					title: "Alt text",
					type: "string",
					description:
						"Describe the image for accessibility and link previews.",
				}),
			],
		}),
		defineField({
			name: "noIndex",
			title: "Exclude from search engines",
			type: "boolean",
			initialValue: false,
		}),
	],
});
