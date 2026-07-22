import { defineQuery } from "next-sanity";

const postCardFields = /* groq */ `
	_id,
	title,
	"slug": slug.current,
	excerpt,
	"publishedAt": coalesce(publishedAt, _createdAt),
	"modifiedAt": _updatedAt,
	featured,
	"views": coalesce(views, 0),
	"readMins": round(length(pt::text(body)) / 1200),
	mainImage{ ..., "lqip": asset->metadata.lqip },
	seo,
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
		"publishedAt": coalesce(publishedAt, _createdAt),
		"modifiedAt": _updatedAt,
		mainImage{ ..., "lqip": asset->metadata.lqip },
		"seo": {
			"title": coalesce(seo.title, title),
			"description": coalesce(seo.description, excerpt),
			"image": coalesce(seo.image, mainImage),
			"noIndex": seo.noIndex == true
		},
		body,
		"author": author->{ name, role, image, bio, x, linkedin, "slug": slug.current },
		"categories": categories[]->{ title, "slug": slug.current }
	}
`);

// Other recent posts to surface at the end of an article.
export const RELATED_POSTS_QUERY = defineQuery(`
	*[_type == "post" && defined(slug.current) && slug.current != $slug && count((categories[]._ref)[@ in *[_type == "post" && slug.current == $slug][0].categories[]._ref]) > 0]
		| order(_createdAt desc)[0...3] {
		${postCardFields}
	}
`);

// Slugs for static generation.
export const POST_SLUGS_QUERY = defineQuery(`
	*[_type == "post" && defined(slug.current)]{ "slug": slug.current }
`);

export const AUTHORS_QUERY = defineQuery(`
	*[_type == "author" && defined(slug.current)] | order(name asc) {
		_id, name, role, bio, x, linkedin, image, "slug": slug.current
	}
`);

export const AUTHOR_QUERY = defineQuery(`
	*[_type == "author" && slug.current == $slug][0] {
		_id, name, role, bio, x, linkedin, image, "slug": slug.current,
		"posts": *[_type == "post" && author._ref == ^._id && defined(slug.current)] | order(coalesce(publishedAt, _createdAt) desc) {
			${postCardFields}
		}
	}
`);

export const SITEMAP_POSTS_QUERY = defineQuery(`
	*[_type == "post" && defined(slug.current) && seo.noIndex != true] {
		"slug": slug.current,
		_updatedAt
	}
`);

// Comments for a specific post.
export const POST_COMMENTS_QUERY = defineQuery(`
	*[
		_type == "comment" &&
		post._ref == *[_type == "post" && slug.current == $slug][0]._id &&
		(status == "approved" || (!defined(status) && approved == true))
	] | order(createdAt desc)[0...100] {
		_id,
		"authorName": coalesce(authorName, "Guest"),
		text,
		createdAt
	}
`);

export const COMMENT_SUBMISSION_CONTEXT_QUERY = defineQuery(`
	{
		"post": *[
			_type == "post" &&
			_id == $postId &&
			!(_id in path("drafts.**"))
		][0] { _id, "slug": slug.current },
		"recentCount": count(*[
			_type == "comment" &&
			submitterHash == $submitterHash &&
			createdAt > $rateCutoff
		]),
		"isDuplicate": count(*[
			_type == "comment" &&
			submitterHash == $submitterHash &&
			contentHash == $contentHash &&
			createdAt > $duplicateCutoff
		]) > 0
	}
`);
