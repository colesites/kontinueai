"use client";

import { useEffect, useState } from "react";
import type { TOCItem } from "@/lib/toc";
import { cn } from "@/lib/utils";

interface TableOfContentsProps {
	items: TOCItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
	const [activeId, setActiveId] = useState<string>("");

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					}
				}
			},
			{ rootMargin: "0px 0px -80% 0px" },
		);

		const elements = document.querySelectorAll("h2, h3");
		for (const el of elements) {
			observer.observe(el);
		}

		return () => {
			for (const el of elements) {
				observer.unobserve(el);
			}
		};
	}, []);

	if (items.length === 0) return null;

	return (
		<nav className="sticky top-32 pr-4">
			<p className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground mb-4">
				On this page
			</p>
			<ul className="space-y-3 border-l border-border/50">
				{items.map((item) => (
					<li
						key={item.id}
						style={{ paddingLeft: `${(item.level - 2) * 1 + 1}rem` }}
					>
						<a
							href={`#${item.id}`}
							className={cn(
								"block text-sm transition-colors hover:text-brand-strong",
								activeId === item.id
									? "font-medium text-brand-strong"
									: "text-muted-foreground",
							)}
						>
							{item.title}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
