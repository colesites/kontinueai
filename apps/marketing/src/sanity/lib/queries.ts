import { defineQuery } from "next-sanity";

const postCardFields = /* groq */ `
	_id,
	title,
	"slug": slug.current,
	excerpt,
	"publishedAt": _createdAt,
	featured,
	"views": coalesce(views, 0),
	"readMins": round(length(pt::text(body)) / 1200),
	mainImage{ ..., "lqip": asset->metadata.lqip },
	"author": author->{ name, role, image, bio, x, linkedin, "slug": slug.current },
	"categories": categories[]->{ title, "slug": slug.current }
`;

// All posts, newest first — used by the blog index.
export const POSTS_QUERY = defineQuery(`
	*[_type == "post" && defined(slug.current)] | order(_createdAt desc) {
		${postCardFields}
	}
`);

// A single post by slug — used by the article reading page.
export const POST_QUERY = defineQuery(`
	*[_type == "post" && slug.current == $slug][0]{
		_id,
		title,
		"slug": slug.current,
		excerpt,
		"publishedAt": _createdAt,
		mainImage{ ..., "lqip": asset->metadata.lqip },
		body,
		"author": author->{ name, role, image, bio, x, linkedin, "slug": slug.current },
		"categories": categories[]->{ title, "slug": slug.current }
	}
`);

// Other recent posts to surface at the end of an article.
export const RELATED_POSTS_QUERY = defineQuery(`
	*[_type == "post" && defined(slug.current) && slug.current != $slug]
		| order(_createdAt desc)[0...3] {
		${postCardFields}
	}
`);

// Slugs for static generation.
export const POST_SLUGS_QUERY = defineQuery(`
	*[_type == "post" && defined(slug.current)]{ "slug": slug.current }
`);

// Comments for a specific post.
export const POST_COMMENTS_QUERY = defineQuery(`
	*[_type == "comment" && post->slug.current == $slug] | order(createdAt desc) {
		_id,
		text,
		createdAt
	}
`);
