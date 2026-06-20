import type { QueryParams } from "next-sanity";
import { client } from "./client";

/**
 * Thin wrapper around `client.fetch` that wires up Next.js caching.
 *
 * Always uses time-based revalidation (default 60s) so content shows up without
 * needing a webhook. `tags` are still attached so on-demand `revalidateTag`
 * works too if a Sanity webhook is added later.
 *
 * Reads published content from the public dataset, so no token is required.
 */
export async function sanityFetch<QueryResponse>({
	query,
	params = {},
	revalidate = 60,
	tags = [],
}: {
	query: string;
	params?: QueryParams;
	revalidate?: number | false;
	tags?: string[];
}): Promise<QueryResponse> {
	return client.fetch<QueryResponse>(query, params, {
		next: {
			revalidate,
			tags,
		},
	});
}
