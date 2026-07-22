import "server-only";

import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "../env";

/**
 * Write-capable client for server-only mutations (e.g. incrementing view
 * counts). Requires a token with write access in `SANITY_API_WRITE_TOKEN`.
 * Never import this into client components.
 */
export const writeClient = createClient({
	projectId,
	dataset,
	apiVersion,
	useCdn: false,
	token: process.env.SANITY_API_WRITE_TOKEN,
});
