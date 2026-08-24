import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BlogSearch, type SearchItem } from "@/components/blog/BlogSearch";
import { NewsletterForm } from "@/components/blog/NewsletterForm";
import { StoryCard } from "@/components/blog/StoryCard";
import { StripeField } from "@/components/blog/StripeField";
import { JsonLd } from "@/components/marketing/JsonLd";
import { formatDate } from "@/lib/blog";
import { pageMetadata } from "@/lib/metadata";
import { blogSchema, breadcrumbSchema } from "@/lib/structured-data";
import { cn } from "@/lib/utils";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { POSTS_QUERY } from "@/sanity/lib/queries";
import type { PostCard, SanityImage } from "@/sanity/lib/types";

export const metadata: Metadata = pageMetadata({
	title: "The Kontinue Journal | Product, AI Models and Engineering",
	description:
		"Product notes, engineering stories, AI model guides, tutorials, research and company updates from Kontinue AI.",
	path: "/blog",
});

export const revalidate = 60;

// Mono label styling. We avoid the global `.eyebrow` class here because it
// hardcodes a muted grey color that can't be overridden (e.g. for white labels
// on the violet cards).
const monoLabel =
	"font-mono text-[0.72rem] font-medium uppercase tracking-[0.22em]";

// ---------------------------------------------------------------------------
// Normalized shapes + helpers (real Sanity posts OR design sample fallback)
// ---------------------------------------------------------------------------

type CoverData = {
	href: string;
	image?: SanityImage | null;
	badge?: string;
	meta: string;
	title: string;
	authorInitials: string;
	authorName: string;
	date?: string;
};

type WeekData = {
	href: string;
	title: string;
	authorInitials: string;
	authorName: string;
	readLabel: string;
};

type StoryData = {
	href: string;
	tag: string;
	meta: string;
	title: string;
	image?: SanityImage | null;
};
type ReadItem = { title: string; meta: string; href?: string };

function initialsOf(name?: string): string {
	if (!name) return "K";
	return name
		.split(/\s+/)
		.map((word) => word[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function minsOf(post: PostCard): number {
	return Math.max(1, post.readMins ?? 1);
}

function categoryOf(post: PostCard): string | undefined {
	return post.categories?.[0]?.title;
}

function metaShort(post: PostCard): string {
	return [categoryOf(post), `${minsOf(post)} min`].filter(Boolean).join(" · ");
}

// The cover ("the very first blog") is pinned to one specific post and never
// changes as newer posts are added. Everything else on the page is dynamic.
const PINNED_COVER_SLUG =
	"one-workspace-every-model-the-thinking-behind-kontinue";

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function Avatar({
	initials,
	className,
}: {
	initials: string;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"grid place-items-center rounded-full font-semibold",
				className,
			)}
		>
			{initials}
		</span>
	);
}

function CoverCard({ data }: { data: CoverData }) {
	return (
		<Link
			href={data.href}
			className="group relative flex min-h-[28rem] flex-col justify-end overflow-hidden rounded-[1.75rem] p-7 lg:col-span-2 lg:min-h-[34rem] lg:p-9"
		>
			{data.image ? (
				<>
					<Image
						src={urlFor(data.image)
							.width(1400)
							.height(1000)
							.fit("crop")
							.auto("format")
							.url()}
						alt={data.image.alt || data.title}
						fill
						sizes="(max-width: 1024px) 100vw, 66vw"
						placeholder={data.image.lqip ? "blur" : "empty"}
						blurDataURL={data.image.lqip}
						className="object-cover"
						priority
					/>
					{/* brand gradient sits above the image */}
					<div className="absolute inset-0 bg-gradient-to-b from-brand-tint/55 via-[oklch(0.74_0.11_295)]/40 to-foreground/90" />
				</>
			) : (
				<StripeField tone="violet" className="absolute inset-0" />
			)}
			<div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

			<div className="relative">
				<div className="flex flex-wrap items-center gap-3">
					{data.badge && (
						<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
							<span className="size-1.5 rounded-full bg-[oklch(0.7_0.18_295)]" />
							{data.badge}
						</span>
					)}
					<span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-white/70">
						{data.meta}
					</span>
				</div>
				<h2 className="font-display mt-5 max-w-xl text-3xl leading-[1.05] text-white sm:text-4xl">
					{data.title}
				</h2>
				<div className="mt-6 flex items-center gap-3">
					<Avatar
						initials={data.authorInitials}
						className="size-9 bg-brand text-xs text-white"
					/>
					<span className="text-sm font-medium text-white">
						{data.authorName}
					</span>
					{data.date && (
						<span className="text-sm text-white/55">· {data.date}</span>
					)}
				</div>
			</div>
		</Link>
	);
}

function WeekCard({ data }: { data: WeekData }) {
	return (
		<Link
			href={data.href}
			className="group relative flex min-h-[28rem] flex-col overflow-hidden rounded-[1.75rem] bg-brand p-7 text-white lg:min-h-[34rem] lg:p-9"
		>
			<span
				aria-hidden
				className="pointer-events-none absolute -top-6 right-2 select-none font-display text-[11rem] leading-none text-white/10"
			>
				”
			</span>
			<span className={cn(monoLabel, "relative text-white")}>
				Blog of the week
			</span>
			<h3 className="font-display relative mt-6 text-2xl leading-[1.12] sm:text-3xl">
				{data.title}
			</h3>
			<div className="relative mt-auto flex items-center gap-3 pt-8">
				<Avatar
					initials={data.authorInitials}
					className="size-9 bg-white/25 text-xs text-white"
				/>
				<span className="text-sm font-medium">{data.authorName}</span>
				<span className="text-sm text-white/60">· {data.readLabel}</span>
			</div>
		</Link>
	);
}

// ---------------------------------------------------------------------------

export default async function BlogIndexPage() {
	let posts: PostCard[] = [];
	try {
		posts = await sanityFetch<PostCard[]>({
			query: POSTS_QUERY,
			tags: ["post"],
		});
	} catch {
		// If Sanity is unreachable, still render the page (search just has nothing).
	}

	const searchItems: SearchItem[] = posts.map((post) => ({
		title: post.title,
		slug: post.slug,
		category: categoryOf(post),
	}));

	const byViews = [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

	// Cover is pinned to a specific post — it never changes as posts are added.
	const coverPost =
		posts.find((post) => post.slug === PINNED_COVER_SLUG) ?? posts[0];

	// The two-card row shows posts the editor toggled "Featured" (not the cover).
	const featuredPosts = posts.filter(
		(post) => post.featured && post._id !== coverPost?._id,
	);
	const featuredIds = new Set(featuredPosts.map((post) => post._id));

	// Blog of the week = most-viewed post that isn't the cover or a featured card.
	const weekPost = byViews.find(
		(post) => post._id !== coverPost?._id && !featuredIds.has(post._id),
	);
	const mostReadPosts = byViews.slice(0, 3);

	// Writer in focus = author of the most-viewed post that has an author.
	const focusAuthor = byViews.find((post) => post.author?.name)?.author;

	const cover: CoverData | null = coverPost
		? {
				href: `/blog/${coverPost.slug}`,
				image: coverPost.mainImage ?? null,
				badge: categoryOf(coverPost),
				meta: `${minsOf(coverPost)} min read`,
				title: coverPost.title,
				authorInitials: initialsOf(coverPost.author?.name),
				authorName: coverPost.author?.name ?? "Kontinue AI",
				date: coverPost.publishedAt
					? formatDate(coverPost.publishedAt)
					: undefined,
			}
		: null;

	const week: WeekData | null = weekPost
		? {
				href: `/blog/${weekPost.slug}`,
				title: weekPost.title,
				authorInitials: initialsOf(weekPost.author?.name),
				authorName: weekPost.author?.name ?? "Kontinue AI",
				readLabel: `${minsOf(weekPost)} min`,
			}
		: null;

	const stories: StoryData[] = featuredPosts.map((post) => ({
		href: `/blog/${post.slug}`,
		tag: categoryOf(post) ?? "Story",
		meta: metaShort(post),
		title: post.title,
		image: post.mainImage ?? null,
	}));

	const mostRead: ReadItem[] = mostReadPosts.map((post) => ({
		href: `/blog/${post.slug}`,
		title: post.title,
		meta: metaShort(post),
	}));

	return (
		<section className="relative px-5 pt-32 pb-24 lg:px-8 lg:pt-40 lg:pb-28">
			<JsonLd data={blogSchema()} />
			<JsonLd
				data={breadcrumbSchema([
					{ name: "Home", href: "/" },
					{ name: "Blog", href: "/blog" },
				])}
			/>
			<div className="mx-auto max-w-6xl">
				{/* ===== Masthead ===== */}
				<header>
					<div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
						<p
							className={cn(
								monoLabel,
								"flex items-center gap-2.5 text-foreground",
							)}
						>
							<span className="size-2 rounded-full bg-brand" />
							The Kontinue Journal
						</p>
						<BlogSearch posts={searchItems} />
					</div>

					<h1 className="font-display tracking-tightest mt-10 max-w-4xl text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.95]">
						Field notes from the <span className="text-brand">Kontinue AI</span>{" "}
						platform.
					</h1>

					<p className="mt-9 max-w-2xl text-lg leading-relaxed text-muted-foreground">
						Product notes, engineering stories, model guides, tutorials,
						research, and company updates from the team building Kontinue AI.
					</p>

					<Link
						href="/blog/all"
						className="link-underline mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong"
					>
						View all posts
						<ArrowRight className="size-4" />
					</Link>
				</header>

				{posts.length === 0 && (
					<div className="mt-16 rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
						<p className="font-display text-xl">No posts yet</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Publish your first post in{" "}
							<span className="font-mono text-foreground">/studio</span>.
						</p>
					</div>
				)}

				{/* ===== Cover + Blog of the week ===== */}
				{cover &&
					(week ? (
						<div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-3">
							<CoverCard data={cover} />
							<WeekCard data={week} />
						</div>
					) : (
						<div className="mt-12 lg:mt-16">
							<CoverCard data={cover} />
						</div>
					))}

				{/* ===== Two stories ===== */}
				{stories.length > 0 && (
					<div className="mt-5 grid gap-5 sm:grid-cols-2">
						{stories.map((story) => (
							<StoryCard
								key={story.title}
								href={story.href}
								tag={story.tag}
								meta={story.meta}
								title={story.title}
								image={story.image}
							/>
						))}
					</div>
				)}

				{/* ===== Most read + Writer in focus ===== */}
				{(mostRead.length > 0 || focusAuthor) && (
					<div
						className={cn(
							"mt-5 grid gap-5",
							mostRead.length > 0 && focusAuthor && "lg:grid-cols-2",
						)}
					>
						{mostRead.length > 0 && (
							<div className="rounded-2xl border border-border bg-card p-7 lg:p-8">
								<p className="eyebrow">Most read this month</p>
								<ol className="mt-5">
									{mostRead.map((item, index) => (
										<li
											key={item.title}
											className="border-t border-border first:border-t-0"
										>
											<Link
												href={item.href ?? "/blog"}
												className="group flex items-baseline gap-5 py-5 first:pt-1"
											>
												<span className="font-mono text-lg tabular-nums text-brand/35">
													{String(index + 1).padStart(2, "0")}
												</span>
												<div>
													<h4 className="font-display text-lg leading-snug">
														{item.title}
													</h4>
													<p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
														{item.meta}
													</p>
												</div>
											</Link>
										</li>
									))}
								</ol>
							</div>
						)}

						{focusAuthor && (
							<div className="flex flex-col rounded-2xl border border-border bg-card p-7 lg:p-8">
								<p className="eyebrow">Writer in focus</p>
								<div className="mt-6 flex items-center gap-4">
									{focusAuthor.image ? (
										<Image
											src={urlFor(focusAuthor.image)
												.width(120)
												.height(120)
												.fit("crop")
												.auto("format")
												.url()}
											alt={focusAuthor.name}
											width={56}
											height={56}
											className="size-14 rounded-full object-cover"
										/>
									) : (
										<Avatar
											initials={initialsOf(focusAuthor.name)}
											className="size-14 bg-brand text-base text-white"
										/>
									)}
									<div>
										<p className="font-display text-xl">{focusAuthor.name}</p>
										{focusAuthor.role && (
											<p className="text-sm text-muted-foreground">
												{focusAuthor.role}
											</p>
										)}
									</div>
								</div>
								{focusAuthor.bio && (
									<p className="mt-6 leading-relaxed text-muted-foreground">
										{focusAuthor.bio}
									</p>
								)}
								<Link
									href={
										focusAuthor.slug
											? `/authors/${focusAuthor.slug}`
											: "/blog/all"
									}
									className="link-underline mt-8 inline-flex items-center gap-1.5 font-medium text-brand-strong"
								>
									All posts by {focusAuthor.name}
									<ArrowRight className="size-4" />
								</Link>
							</div>
						)}
					</div>
				)}

				{/* ===== Newsletter ===== */}
				<div className="relative mt-5 overflow-hidden rounded-[1.75rem] bg-foreground px-7 py-12 lg:px-12 lg:py-14">
					<div
						aria-hidden
						className="pointer-events-none absolute -right-16 -top-12 size-72 rounded-full bg-brand/40 blur-3xl"
					/>
					<div className="relative flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
						<div className="max-w-xl">
							<p className="font-mono text-[0.72rem] font-medium uppercase tracking-[0.22em] text-[oklch(0.72_0.16_295)]">
								The Kontinue memo
							</p>
							<h2 className="font-display mt-4 text-3xl leading-tight text-white sm:text-4xl">
								One email. Product work worth following.
							</h2>
							<p className="mt-3 text-white/60">
								A monthly dispatch on building Kontinue AI, portable
								conversations, and thoughtful model use.
							</p>
						</div>
						<NewsletterForm />
					</div>
				</div>
			</div>
		</section>
	);
}
