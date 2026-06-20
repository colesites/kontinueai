import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/blog";
import { urlFor } from "@/sanity/lib/image";
import type { PostCard as PostCardType } from "@/sanity/lib/types";

export function PostCard({ post }: { post: PostCardType }) {
	return (
		<Link
			href={`/blog/${post.slug}`}
			className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/20"
		>
			{post.mainImage && (
				<div className="relative aspect-[16/10] overflow-hidden bg-secondary">
					<Image
						src={urlFor(post.mainImage)
							.width(800)
							.height(500)
							.fit("crop")
							.auto("format")
							.url()}
						alt={post.mainImage.alt || post.title}
						fill
						sizes="(max-width: 768px) 100vw, 33vw"
						className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
					/>
				</div>
			)}
			<div className="flex flex-1 flex-col p-6">
				{post.categories?.[0] && (
					<span className="text-[0.7rem] font-semibold uppercase tracking-wider text-brand-strong">
						{post.categories[0].title}
					</span>
				)}
				<h3 className="font-display mt-3 text-xl leading-snug tracking-tight transition-colors group-hover:text-brand-strong">
					{post.title}
				</h3>
				{post.excerpt && (
					<p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
						{post.excerpt}
					</p>
				)}
				<div className="mt-auto pt-5 text-xs text-muted-foreground">
					{post.author?.name && <span>{post.author.name}</span>}
					{post.author?.name && post.publishedAt && <span> · </span>}
					{post.publishedAt && (
						<time dateTime={post.publishedAt}>
							{formatDate(post.publishedAt)}
						</time>
					)}
				</div>
			</div>
		</Link>
	);
}
