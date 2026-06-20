"use client";

import { useEffect } from "react";

// Fires a single view count for the post when the article mounts.
// Best-effort: failures are swallowed so they never affect the reader.
export function ViewTracker({ slug }: { slug: string }) {
	useEffect(() => {
		const key = `viewed:${slug}`;
		if (sessionStorage.getItem(key)) return;
		sessionStorage.setItem(key, "1");
		fetch("/api/blog/view", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ slug }),
			keepalive: true,
		}).catch(() => {});
	}, [slug]);

	return null;
}
