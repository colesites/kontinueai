import type { SchemaTypeDefinition } from "sanity";
import { authorType } from "./authorType";
import { blockContentType } from "./blockContentType";
import { categoryType } from "./categoryType";
import { postType } from "./postType";
import { commentType } from "./commentType";

export const schema: { types: SchemaTypeDefinition[] } = {
	types: [postType, authorType, categoryType, blockContentType, commentType],
};
