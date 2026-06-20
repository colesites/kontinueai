"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type SearchItem = {
	title: string;
	slug: string;
	category?: string;
};

export function BlogSearch({ posts }: { posts: SearchItem[] }) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);

	const results = useMemo(() => {
		const term = query.trim().toLowerCase();
		if (!term) return [];
		return posts
			.filter(
				(post) =>
					post.title.toLowerCase().includes(term) ||
					post.category?.toLowerCase().includes(term),
			)
			.slice(0, 6);
	}, [query, posts]);

	const showPanel = open && query.trim().length > 0;

	return (
		<div className="relative w-full sm:w-72">
			<div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 transition-colors focus-within:border-border-strong">
				<Search className="size-4 shrink-0 text-muted-foreground" />
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onFocus={() => setOpen(true)}
					onBlur={() => setTimeout(() => setOpen(false), 120)}
					placeholder="Search the journal"
					aria-label="Search the journal"
					className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>

			{showPanel && (
				<div className="card-shadow absolute right-0 z-30 mt-2 w-full min-w-[18rem] overflow-hidden rounded-2xl border border-border bg-card">
					{results.length > 0 ? (
						results.map((result) => (
							<Link
								key={result.slug}
								href={`/blog/${result.slug}`}
								className="block px-4 py-3 transition-colors hover:bg-accent"
							>
								<p className="text-sm font-medium text-foreground">
									{result.title}
								</p>
								{result.category && (
									<p className="mt-0.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
										{result.category}
									</p>
								)}
							</Link>
						))
					) : (
						<p className="px-4 py-3 text-sm text-muted-foreground">
							No stories match “{query.trim()}” yet.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
