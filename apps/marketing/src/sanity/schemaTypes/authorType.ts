import { UserIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const authorType = defineType({
	name: "author",
	title: "Author",
	type: "document",
	icon: UserIcon,
	fields: [
		defineField({
			name: "name",
			type: "string",
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "slug",
			type: "slug",
			options: { source: "name", maxLength: 96 },
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: "image",
			title: "Avatar",
			type: "image",
			options: { hotspot: true },
		}),
		defineField({
			name: "role",
			title: "Role",
			type: "string",
			description: "e.g. Founder, Engineering",
		}),
		defineField({
			name: "bio",
			type: "text",
			rows: 3,
		}),
		defineField({
			name: "x",
			title: "X (Twitter) URL",
			type: "url",
			validation: (rule) => rule.uri({ scheme: ["http", "https"] }),
		}),
		defineField({
			name: "linkedin",
			title: "LinkedIn URL",
			type: "url",
			validation: (rule) => rule.uri({ scheme: ["http", "https"] }),
		}),
	],
	preview: {
		select: { title: "name", subtitle: "role", media: "image" },
	},
});
