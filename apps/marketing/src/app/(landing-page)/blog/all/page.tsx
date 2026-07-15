import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AllPostsBrowser } from "@/components/blog/AllPostsBrowser";
import { pageMetadata } from "@/lib/metadata";
import { sanityFetch } from "@/sanity/lib/fetch";
import { POSTS_QUERY } from "@/sanity/lib/queries";
import type { PostCard } from "@/sanity/lib/types";

export const metadata: Metadata = pageMetadata({
	title: "All Posts | The Kontinue Journal",
	description: "Every published story from The Kontinue Journal, newest first.",
	path: "/blog/all",
});

export const revalidate = 60;

type Props = { searchParams: Promise<{ author?: string }> };

export default async function AllPostsPage({ searchParams }: Props) {
	const { author } = await searchParams;

	let posts: PostCard[] = [];
	try {
		posts = await sanityFetch<PostCard[]>({
			query: POSTS_QUERY,
			tags: ["post"],
		});
	} catch {
		// Sanity unreachable — render an empty browser rather than 500.
	}

	let authorName: string | undefined;
	if (author) {
		const byAuthor = posts.filter((post) => post.author?.slug === author);
		authorName = byAuthor[0]?.author?.name;
		posts = byAuthor;
	}

	const categories = Array.from(
		new Set(
			posts.flatMap((post) => post.categories?.map((c) => c.title) ?? []),
		),
	).sort();

	return (
		<section className="relative px-5 pt-32 pb-24 lg:px-8 lg:pt-40 lg:pb-28">
			<div className="mx-auto max-w-6xl">
				<Link
					href="/blog"
					className="link-underline inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong"
				>
					<ArrowLeft className="size-4" />
					Back to blog
				</Link>

				<h1 className="font-display tracking-tightest mt-8 text-[2.5rem] leading-[1.04] sm:text-6xl">
					{authorName ? `Posts by ${authorName}` : "All posts"}
				</h1>
				<p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
					{authorName
						? `Everything written by ${authorName}.`
						: "Every story from the journal, newest first."}
				</p>

				<div className="mt-12">
					{posts.length > 0 ? (
						<AllPostsBrowser posts={posts} categories={categories} />
					) : (
						<p className="text-muted-foreground">
							No posts yet. Publish one in{" "}
							<span className="font-mono text-foreground">/studio</span>.
						</p>
					)}
				</div>
			</div>
		</section>
	);
}
