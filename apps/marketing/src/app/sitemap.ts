import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";
import { sanityFetch } from "@/sanity/lib/fetch";
import { SITEMAP_POSTS_QUERY } from "@/sanity/lib/queries";

/**
 * Each page and the day its content last changed. Update a page's date when
 * you change what it says; search engines trust these dates only when they're
 * real. Blog pages follow their newest post instead.
 */
const pages: Record<string, string> = {
	"/": "2026-11-12",
	"/kontinue-model": "2026-10-14",
	"/import-ai-conversations": "2026-07-16",
	"/import-chatgpt-conversations": "2026-07-16",
	"/import-claude-conversations": "2026-07-16",
	"/import-gemini-conversations": "2026-07-16",
	"/supported-models": "2026-07-16",
	"/pricing": "2026-09-07",
	"/about": "2026-08-24",
	"/security": "2026-07-16",
	"/press": "2026-08-24",
	"/download": "2026-11-12",
	"/authors/aderibigbe-adedamola": "2026-08-24",
	"/legal/privacy-policy": "2026-07-16",
	"/legal/terms-of-service": "2026-07-17",
};

const BLOG_PATHS = ["/blog", "/blog/all"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	let posts: Array<{ slug: string; _updatedAt: string }> = [];
	try {
		posts = await sanityFetch({ query: SITEMAP_POSTS_QUERY, revalidate: 3600 });
	} catch {
		// Static marketing pages remain available when Sanity cannot be reached.
	}

	const newestPost = posts.reduce<Date | null>((newest, post) => {
		const updated = new Date(post._updatedAt);
		return !newest || updated > newest ? updated : newest;
	}, null);
	const priority = (path: string) =>
		path === "/"
			? 1
			: path === "/kontinue-model" ||
					path === "/import-ai-conversations" ||
					path === "/download"
				? 0.9
				: 0.7;

	return [
		...Object.entries(pages).map(([path, date]) => ({
			url: new URL(path, SITE_URL).toString(),
			lastModified: new Date(`${date}T00:00:00.000Z`),
			changeFrequency: "monthly" as const,
			priority: priority(path),
		})),
		...BLOG_PATHS.map((path) => ({
			url: new URL(path, SITE_URL).toString(),
			lastModified: newestPost ?? new Date("2026-08-24T00:00:00.000Z"),
			changeFrequency: "weekly" as const,
			priority: 0.7,
		})),
		...posts.map((post) => ({
			url: `${SITE_URL}/blog/${post.slug}`,
			lastModified: new Date(post._updatedAt),
			changeFrequency: "monthly" as const,
			priority: 0.7,
		})),
	];
}
