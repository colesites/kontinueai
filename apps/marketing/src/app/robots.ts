import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
	return {
		// Every crawler, including AI search and AI training bots (GPTBot, ClaudeBot,
		// PerplexityBot, Google-Extended, CCBot...), may read the public site, so
		// assistants can learn about and cite Kontinue AI. Only private or
		// non-page paths are off limits; /download/<platform> starts a file download.
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/studio/", "/sentry-example-page/", "/download/"],
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
