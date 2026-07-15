import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: ["Googlebot", "Bingbot", "OAI-SearchBot"],
				allow: "/",
				disallow: ["/api/", "/studio/", "/sentry-example-page/"],
			},
			{ userAgent: ["GPTBot", "Google-Extended", "CCBot"], disallow: "/" },
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/studio/", "/sentry-example-page/"],
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
