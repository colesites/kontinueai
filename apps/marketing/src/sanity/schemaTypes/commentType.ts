import { defineField, defineType } from "sanity";

export const commentType = defineType({
	name: "comment",
	title: "Comment",
	type: "document",
	fields: [
		defineField({
			name: "post",
			title: "Post",
			type: "reference",
			to: [{ type: "post" }],
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "text",
			title: "Comment Text",
			type: "text",
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "createdAt",
			title: "Created At",
			type: "datetime",
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "approved",
			title: "Approved for publication",
			type: "boolean",
			initialValue: false,
			description:
				"Only approved comments appear on the public marketing website.",
		}),
	],
	preview: {
		select: {
			title: "text",
			subtitle: "post.title",
		},
	},
});
