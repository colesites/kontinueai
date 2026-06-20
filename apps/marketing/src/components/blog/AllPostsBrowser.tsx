"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { PostCard } from "@/sanity/lib/types";
import { StoryCard } from "./StoryCard";

function chip(active: boolean) {
	return cn(
		"rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
		active
			? "border-brand bg-brand-tint text-brand-strong"
			: "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
	);
}

export function AllPostsBrowser({
	posts,
	categories,
}: {
	posts: PostCard[];
	categories: string[];
}) {
	const [query, setQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState<string | null>(null);

	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase();
		return posts.filter((post) => {
			const inCategory =
				!activeCategory ||
				post.categories?.some((category) => category.title === activeCategory);
			const matchesTerm =
				!term ||
				post.title.toLowerCase().includes(term) ||
				post.excerpt?.toLowerCase().includes(term) ||
				post.categories?.some((category) =>
					category.title.toLowerCase().includes(term),
				);
			return inCategory && matchesTerm;
		});
	}, [posts, query, activeCategory]);

	return (
		<div>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 lg:w-80">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search posts"
						aria-label="Search posts"
						className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>

				{categories.length > 0 && (
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => setActiveCategory(null)}
							className={chip(activeCategory === null)}
						>
							All
						</button>
						{categories.map((category) => (
							<button
								type="button"
								key={category}
								onClick={() => setActiveCategory(category)}
								className={chip(activeCategory === category)}
							>
								{category}
							</button>
						))}
					</div>
				)}
			</div>

			{filtered.length > 0 ? (
				<div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{filtered.map((post) => (
						<StoryCard
							key={post._id}
							href={`/blog/${post.slug}`}
							tag={post.categories?.[0]?.title ?? "Story"}
							meta={[
								post.categories?.[0]?.title,
								`${Math.max(1, post.readMins ?? 1)} min read`,
							]
								.filter(Boolean)
								.join(" · ")}
							title={post.title}
							image={post.mainImage}
						/>
					))}
				</div>
			) : (
				<p className="mt-12 text-muted-foreground">
					No posts match your search.
				</p>
			)}
		</div>
	);
}
