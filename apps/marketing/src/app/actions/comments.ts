"use server";

import { createClient } from "next-sanity";
import { revalidatePath } from "next/cache";
import { apiVersion, dataset, projectId } from "@/sanity/env";

export async function createComment(postId: string, text: string) {
	if (!postId || !text.trim()) {
		throw new Error("Missing required fields");
	}

	const writeClient = createClient({
		projectId,
		dataset,
		apiVersion,
		useCdn: false,
		token: process.env.SANITY_API_WRITE_TOKEN,
	});

	try {
		await writeClient.create({
			_type: "comment",
			post: {
				_type: "reference",
				_ref: postId,
			},
			text: text.trim(),
			createdAt: new Date().toISOString(),
		});

		// Revalidate the blog pages
		revalidatePath("/blog/[slug]", "page");
		return { success: true };
	} catch (error) {
		console.error("Failed to create comment:", error);
		return { success: false, error: "Failed to post comment." };
	}
}
