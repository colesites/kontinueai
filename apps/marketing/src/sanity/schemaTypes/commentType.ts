import { CommentIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const commentType = defineType({
	name: "comment",
	title: "Comment",
	type: "document",
	icon: CommentIcon,
	fields: [
		defineField({
			name: "post",
			title: "Post",
			type: "reference",
			to: [{ type: "post" }],
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "authorName",
			title: "Display name",
			type: "string",
			validation: (rule) => rule.required().min(2).max(60),
		}),
		defineField({
			name: "text",
			title: "Comment Text",
			type: "text",
			validation: (rule) => rule.required().min(3).max(2000),
		}),
		defineField({
			name: "createdAt",
			title: "Created At",
			type: "datetime",
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "status",
			title: "Moderation status",
			type: "string",
			initialValue: "pending",
			options: {
				layout: "radio",
				list: [
					{ title: "Pending review", value: "pending" },
					{ title: "Approved", value: "approved" },
					{ title: "Rejected", value: "rejected" },
				],
			},
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "approved",
			title: "Legacy approval",
			type: "boolean",
			readOnly: true,
			hidden: ({ value }) => value === undefined,
			deprecated: {
				reason:
					"Use Moderation status. This field is retained for existing comments.",
			},
		}),
		defineField({
			name: "submitterHash",
			title: "Submitter fingerprint",
			type: "string",
			hidden: true,
			readOnly: true,
		}),
		defineField({
			name: "contentHash",
			title: "Content fingerprint",
			type: "string",
			hidden: true,
			readOnly: true,
		}),
	],
	preview: {
		select: {
			title: "text",
			authorName: "authorName",
			postTitle: "post.title",
			status: "status",
		},
		prepare({ title, authorName, postTitle, status }) {
			return {
				title,
				subtitle: `${authorName ?? "Guest"} · ${postTitle ?? "Unknown post"} · ${status ?? "legacy"}`,
			};
		},
	},
});
