import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";
import { sanityFetch } from "@/sanity/lib/fetch";
import { SITEMAP_POSTS_QUERY } from "@/sanity/lib/queries";

const publicPaths = [
	"/",
	"/kontinue-model",
	"/import-ai-conversations",
	"/import-chatgpt-conversations",
	"/import-claude-conversations",
	"/import-gemini-conversations",
	"/supported-models",
	"/pricing",
	"/about",
	"/security",
	"/press",
	"/blog",
	"/blog/all",
	"/authors/aderibigbe-adedamola",
	"/download",
	"/legal/privacy-policy",
	"/legal/terms-of-service",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const reviewedAt = new Date("2026-07-15T00:00:00.000Z");
	let posts: Array<{ slug: string; _updatedAt: string }> = [];
	try {
		posts = await sanityFetch({ query: SITEMAP_POSTS_QUERY, revalidate: 3600 });
	} catch {
		// Static marketing pages remain available when Sanity cannot be reached.
	}

	return [
		...publicPaths.map((path) => ({
			url: new URL(path, SITE_URL).toString(),
			lastModified: reviewedAt,
			changeFrequency: path.startsWith("/blog")
				? ("weekly" as const)
				: ("monthly" as const),
			priority:
				path === "/"
					? 1
					: path === "/kontinue-model" || path === "/import-ai-conversations"
						? 0.9
						: 0.7,
		})),
		...posts.map((post) => ({
			url: `${SITE_URL}/blog/${post.slug}`,
			lastModified: new Date(post._updatedAt),
			changeFrequency: "monthly" as const,
			priority: 0.7,
		})),
	];
}
