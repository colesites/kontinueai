import type { SanityImageSource } from "@sanity/image-url";
import type { PortableTextBlock } from "next-sanity";

/**
 * Hand-written result types for the blog queries.
 *
 * Once `bun run typegen` is wired into the build, these can be replaced by the
 * generated types in `src/sanity/types.ts`.
 */

export type SanityImage = SanityImageSource & {
	alt?: string;
	lqip?: string;
};

export interface Author {
	name: string;
	role?: string;
	image?: SanityImage;
	bio?: string;
	x?: string;
	linkedin?: string;
	slug?: string;
}

export interface Category {
	title: string;
	slug: string;
}

export interface PostCard {
	_id: string;
	title: string;
	slug: string;
	excerpt?: string;
	publishedAt?: string;
	featured?: boolean;
	views?: number;
	readMins?: number;
	mainImage?: SanityImage;
	author?: Author;
	categories?: Category[];
}

export interface Post extends Omit<PostCard, "featured"> {
	body?: PortableTextBlock[];
}
