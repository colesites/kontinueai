import type { SchemaTypeDefinition } from "sanity";
import { authorType } from "./authorType";
import { blockContentType } from "./blockContentType";
import { categoryType } from "./categoryType";
import { commentType } from "./commentType";
import { postType } from "./postType";
import { seoType } from "./seoType";

export const schema: { types: SchemaTypeDefinition[] } = {
	types: [
		postType,
		authorType,
		categoryType,
		blockContentType,
		commentType,
		seoType,
	],
};
