import { ArrowLeft, Linkedin } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentsSection } from "@/components/blog/CommentsSection";
import { PortableTextBody } from "@/components/blog/PortableTextBody";
import { StoryCard } from "@/components/blog/StoryCard";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { ViewTracker } from "@/components/blog/ViewTracker";
import { JsonLd } from "@/components/marketing/JsonLd";
import { TrackedLink } from "@/components/marketing/TrackedLink";
import { formatDate, readingTime } from "@/lib/blog";
import { pageMetadata } from "@/lib/metadata";
import { articleSchema, breadcrumbSchema } from "@/lib/structured-data";
import { extractHeadings } from "@/lib/toc";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import {
	POST_COMMENTS_QUERY,
	POST_QUERY,
	POST_SLUGS_QUERY,
	RELATED_POSTS_QUERY,
} from "@/sanity/lib/queries";
import type { Post, PostCard, PostComment } from "@/sanity/lib/types";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;

function initialsOf(name?: string): string {
	if (!name) return "K";
	return name
		.split(/\s+/)
		.map((word) => word[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export async function generateStaticParams() {
	const slugs = await sanityFetch<{ slug: string }[]>({
		query: POST_SLUGS_QUERY,
	});
	return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = await sanityFetch<Post | null>({
		query: POST_QUERY,
		params: { slug },
		tags: [`post:${slug}`],
	});
	if (!post) return {};

	const metadataImage = post.seo?.image ?? post.mainImage;
	const ogImage = metadataImage
		? urlFor(metadataImage)
				.width(1200)
				.height(630)
				.fit("crop")
				.auto("format")
				.url()
		: undefined;

	const title = post.seo?.title ?? post.title;
	const description = post.seo?.description ?? post.excerpt ?? post.title;
	const imageAlt = metadataImage?.alt ?? post.mainImage?.alt ?? post.title;
	const base = pageMetadata({
		title: `${title} | Kontinue AI`,
		description,
		path: `/blog/${post.slug}`,
		type: "article",
		...(ogImage ? { image: ogImage } : {}),
		imageAlt,
		noIndex: post.seo?.noIndex ?? false,
	});
	return {
		...base,
		authors: post.author?.name ? [{ name: post.author.name }] : undefined,
		openGraph: {
			...base.openGraph,
			type: "article",
			publishedTime: post.publishedAt,
			modifiedTime: post.modifiedAt,
			authors: post.author?.name ? [post.author.name] : undefined,
			section: post.categories?.[0]?.title,
			tags: post.categories?.map((category) => category.title),
		},
	};
}

function RelatedStories({ related }: { related: PostCard[] }) {
	if (related.length === 0) return null;

	return (
		<div className="mx-auto mt-20 max-w-5xl">
			<p className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
				Keep reading
			</p>
			<div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{related.map((item) => (
					<StoryCard
						key={item._id}
						href={`/blog/${item.slug}`}
						tag={item.categories?.[0]?.title ?? "Story"}
						meta={[
							item.categories?.[0]?.title,
							`${Math.max(1, item.readMins ?? 1)} min read`,
						]
							.filter(Boolean)
							.join(" · ")}
						title={item.title}
						image={item.mainImage}
					/>
				))}
			</div>
		</div>
	);
}

export default async function ArticlePage({ params }: Props) {
	const { slug } = await params;

	const [post, related, comments] = await Promise.all([
		sanityFetch<Post | null>({
			query: POST_QUERY,
			params: { slug },
			tags: [`post:${slug}`],
		}),
		sanityFetch<PostCard[]>({
			query: RELATED_POSTS_QUERY,
			params: { slug },
			tags: ["post"],
		}),
		sanityFetch<PostComment[]>({
			query: POST_COMMENTS_QUERY,
			params: { slug },
			tags: [`post-comments:${slug}`],
		}),
	]);

	if (!post) notFound();

	const author = post.author;
	const category = post.categories?.[0]?.title;
	const minutes = readingTime(post.body);
	const tocItems = extractHeadings(post.body);
	const schemaImageSource = post.seo?.image ?? post.mainImage;
	const schemaImage = schemaImageSource
		? urlFor(schemaImageSource)
				.width(1200)
				.height(630)
				.fit("crop")
				.auto("format")
				.url()
		: undefined;
	const authorName = author?.name ?? "Kontinue AI";

	return (
		<article className="relative px-5 pt-32 pb-24 lg:pt-40">
			<ViewTracker slug={post.slug} />
			<JsonLd
				data={articleSchema({
					title: post.title,
					description: post.excerpt,
					path: `/blog/${post.slug}`,
					image: schemaImage,
					authorName,
					authorSlug: author?.slug,
					publishedAt: post.publishedAt,
					modifiedAt: post.modifiedAt,
				})}
			/>
			<JsonLd
				data={breadcrumbSchema([
					{ name: "Home", href: "/" },
					{ name: "Blog", href: "/blog" },
					{ name: post.title, href: `/blog/${post.slug}` },
				])}
			/>

			<div className="mx-auto max-w-[64rem]">
				{/* Header Section */}
				<div className="w-full max-w-3xl">
					<Link
						href="/blog"
						className="link-underline inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong"
					>
						<ArrowLeft className="size-4" />
						Back to blog
					</Link>

					<p className="mt-8 font-mono text-[0.72rem] uppercase tracking-[0.2em]">
						{category && (
							<>
								<span className="text-brand-strong">{category}</span>
								<span className="text-muted-foreground"> · </span>
							</>
						)}
						<span className="text-muted-foreground">
							{post.publishedAt ? `${formatDate(post.publishedAt)} · ` : ""}
							{minutes} min read
						</span>
					</p>

					<h1 className="font-display tracking-tightest mt-5 text-[2.5rem] leading-[1.04] sm:text-6xl">
						{post.title}
					</h1>

					{post.excerpt && (
						<p className="mt-6 text-xl leading-relaxed text-muted-foreground">
							{post.excerpt}
						</p>
					)}

					{/* author + social links */}
					<div className="mt-8 flex items-center justify-between gap-4 border-y border-border py-5">
						<div className="flex items-center gap-3.5">
							{author?.image ? (
								<Image
									src={urlFor(author.image)
										.width(96)
										.height(96)
										.fit("crop")
										.auto("format")
										.url()}
									alt={author.name}
									width={44}
									height={44}
									className="size-11 rounded-full object-cover"
								/>
							) : (
								<span className="grid size-11 place-items-center rounded-full bg-brand text-sm font-semibold text-white">
									{initialsOf(author?.name)}
								</span>
							)}
							<div>
								{author?.slug ? (
									<Link
										href={`/authors/${author.slug}`}
										className="font-semibold leading-tight hover:text-brand"
									>
										{authorName}
									</Link>
								) : (
									<p className="font-semibold leading-tight">{authorName}</p>
								)}
								{author?.role && (
									<p className="text-sm text-muted-foreground">{author.role}</p>
								)}
							</div>
						</div>
						{(author?.x || author?.linkedin) && (
							<div className="flex items-center gap-2">
								{author?.x && (
									<a
										href={author.x}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={`${author.name} on X`}
										className="grid size-9 place-items-center rounded-full border border-border text-[0.95rem] font-bold text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
									>
										X
									</a>
								)}
								{author?.linkedin && (
									<a
										href={author.linkedin}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={`${author.name} on LinkedIn`}
										className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
									>
										<Linkedin className="size-4" />
									</a>
								)}
							</div>
						)}
					</div>
				</div>

				{/* hero */}
				<div className="mt-10">
					{post.mainImage ? (
						<Image
							src={urlFor(post.mainImage)
								.width(1600)
								.height(800)
								.fit("crop")
								.auto("format")
								.url()}
							alt={post.mainImage.alt || post.title}
							width={1600}
							height={800}
							placeholder={post.mainImage.lqip ? "blur" : "empty"}
							blurDataURL={post.mainImage.lqip}
							className="aspect-[2/1] w-full rounded-[1.5rem] object-cover"
							priority
						/>
					) : (
						<div className="relative aspect-[2/1] overflow-hidden rounded-[1.5rem] bg-brand-tint">
							<div
								className="absolute inset-0"
								style={{
									backgroundImage:
										"repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 18px)",
								}}
							/>
							<span className="absolute bottom-5 left-6 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-foreground/40">
								[ Article hero · 16:8 ]
							</span>
						</div>
					)}
				</div>

				{/* body */}
				<div className="mt-12 flex flex-col items-start gap-12 lg:flex-row lg:gap-16">
					<div className="w-full max-w-3xl flex-1">
						<PortableTextBody value={post.body} />

						<div className="mt-14 rounded-2xl border border-brand/20 bg-brand-tint p-7 sm:flex sm:items-center sm:justify-between sm:gap-8">
							<div>
								<p className="eyebrow">Bring your context with you</p>
								<p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
									Import a supported AI conversation into Kontinue, then
									continue with K-AI 1.0 or another available model.
								</p>
							</div>
							<TrackedLink
								href="/import-ai-conversations"
								eventName="blog_to_product_clicked"
								eventProperties={{ article: post.slug }}
								className="mt-5 shrink-0 sm:mt-0"
							>
								See how importing works
							</TrackedLink>
						</div>

						{/* written by */}
						{author && (
							<div className="mt-14 rounded-2xl border border-border bg-card p-7">
								<p className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
									Written by
								</p>
								<div className="mt-4 flex items-start gap-4">
									{author.image ? (
										<Image
											src={urlFor(author.image)
												.width(112)
												.height(112)
												.fit("crop")
												.auto("format")
												.url()}
											alt={author.name}
											width={48}
											height={48}
											className="size-12 rounded-full object-cover"
										/>
									) : (
										<span className="grid size-12 place-items-center rounded-full bg-brand text-sm font-semibold text-white">
											{initialsOf(author.name)}
										</span>
									)}
									<div>
										<p className="font-display text-lg">
											{author.slug ? (
												<Link
													href={`/authors/${author.slug}`}
													className="font-semibold hover:text-brand"
												>
													{author.name}
												</Link>
											) : (
												<span className="font-semibold">{author.name}</span>
											)}
											{author.role && (
												<span className="text-muted-foreground">
													{" · "}
													{author.role}
												</span>
											)}
										</p>
										{author.bio && (
											<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
												{author.bio}
											</p>
										)}
									</div>
								</div>
							</div>
						)}

						{/* comments section */}
						<CommentsSection initialComments={comments} />
					</div>

					{/* TOC Sidebar (Right) */}
					<aside className="hidden w-56 shrink-0 lg:sticky lg:top-32 lg:block">
						<TableOfContents items={tocItems} />
					</aside>
				</div>
			</div>

			<RelatedStories related={related} />
		</article>
	);
}
