import { DocumentTextIcon } from "@sanity/icons";
import { defineArrayMember, defineField, defineType } from "sanity";

export const postType = defineType({
	name: "post",
	title: "Post",
	type: "document",
	icon: DocumentTextIcon,
	fields: [
		defineField({
			name: "title",
			type: "string",
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "slug",
			type: "slug",
			options: { source: "title", maxLength: 96 },
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "excerpt",
			type: "text",
			rows: 3,
			description: "Short summary shown on the blog index and in previews.",
			validation: (rule) =>
				rule.max(200).warning("Keep under 200 characters for best SEO."),
		}),
		defineField({
			name: "mainImage",
			title: "Cover image",
			type: "image",
			options: { hotspot: true },
			fields: [defineField({ name: "alt", type: "string", title: "Alt text" })],
		}),
		defineField({
			name: "author",
			type: "reference",
			to: [{ type: "author" }],
		}),
		defineField({
			name: "categories",
			type: "array",
			of: [
				defineArrayMember({ type: "reference", to: [{ type: "category" }] }),
			],
		}),
		// No manual "published at" — the date is taken automatically from
		// Sanity's built-in `_createdAt` timestamp (see queries).
		defineField({
			name: "featured",
			title: "Featured",
			type: "boolean",
			description: "Show this post as the large cover on the blog.",
			initialValue: false,
		}),
		// Auto-counted page views. Managed entirely by /api/blog/view, never by
		// editors — so it's hidden from the Studio form (and read-only as a guard).
		defineField({
			name: "views",
			title: "Views",
			type: "number",
			initialValue: 0,
			readOnly: true,
			hidden: true,
		}),
		defineField({
			name: "body",
			type: "blockContent",
		}),
	],
	preview: {
		select: { title: "title", author: "author.name", media: "mainImage" },
		prepare({ title, author, media }) {
			return { title, subtitle: author ? `by ${author}` : undefined, media };
		},
	},
});
