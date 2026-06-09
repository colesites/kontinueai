import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: "https://kontinueai.com",
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1,
			images: ["https://kontinueai.com/favicon.ico"],
		},
		{
			url: "https://chat.kontinueai.com",
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.9,
			images: ["https://kontinueai.com/favicon.ico"],
		},

		{
			url: "https://kontinueai.com/legal/privacy-policy",
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.7,
			images: ["https://kontinueai.com/favicon.ico"],
		},
		{
			url: "https://kontinueai.com/legal/terms-of-service",
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.7,
			images: ["https://kontinueai.com/favicon.ico"],
		},
	];
}
