import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryCard } from "@/components/blog/StoryCard";
import { Breadcrumbs } from "@/components/marketing/PagePrimitives";
import { product } from "@/data/product";
import { pageMetadata } from "@/lib/metadata";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { AUTHOR_QUERY, AUTHORS_QUERY } from "@/sanity/lib/queries";
import type { Author, AuthorPage } from "@/sanity/lib/types";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;

const founderSlug = "aderibigbe-adedamola";
const founderFallback: AuthorPage = {
	_id: "founder-fallback",
	name: product.company.founder.name,
	role: product.company.founder.role,
	slug: founderSlug,
	posts: [],
};

export async function generateStaticParams() {
	try {
		const authors = await sanityFetch<Author[]>({ query: AUTHORS_QUERY });
		return Array.from(
			new Set([
				founderSlug,
				...authors.flatMap((author) => (author.slug ? [author.slug] : [])),
			]),
		).map((slug) => ({ slug }));
	} catch {
		return [{ slug: founderSlug }];
	}
}

async function getAuthor(slug: string) {
	try {
		const author = await sanityFetch<AuthorPage | null>({
			query: AUTHOR_QUERY,
			params: { slug },
			tags: [`author:${slug}`],
		});
		return author ?? (slug === founderSlug ? founderFallback : null);
	} catch {
		return slug === founderSlug ? founderFallback : null;
	}
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const author = await getAuthor(slug);
	if (!author) return {};
	return pageMetadata({
		title: `${author.name} | Kontinue AI Author`,
		description:
			author.bio ??
			`${author.name}, ${author.role ?? "author"} at Kontinue AI.`,
		path: `/authors/${slug}`,
	});
}

export default async function AuthorPageRoute({ params }: Props) {
	const { slug } = await params;
	const author = await getAuthor(slug);
	if (!author) notFound();
	const initials = author.name
		.split(/\s+/)
		.map((word) => word[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

	return (
		<section className="px-5 pt-32 pb-24 lg:px-8 lg:pt-40 lg:pb-32">
			<div className="mx-auto max-w-6xl">
				<Breadcrumbs
					items={[
						{ name: "Home", href: "/" },
						{ name: "Blog", href: "/blog" },
						{ name: author.name, href: `/authors/${slug}` },
					]}
				/>
				<div className="flex max-w-3xl flex-col gap-6 sm:flex-row sm:items-center">
					{author.image ? (
						<Image
							src={urlFor(author.image)
								.width(240)
								.height(240)
								.fit("crop")
								.auto("format")
								.url()}
							alt={author.name}
							width={120}
							height={120}
							className="size-28 rounded-full object-cover"
						/>
					) : (
						<span className="grid size-28 place-items-center rounded-full bg-brand text-2xl font-semibold text-white">
							{initials}
						</span>
					)}
					<div>
						<p className="eyebrow">Author</p>
						<h1 className="font-display tracking-tightest mt-3 text-4xl sm:text-6xl">
							{author.name}
						</h1>
						{author.role ? (
							<p className="mt-3 text-lg text-muted-foreground">
								{author.role}
							</p>
						) : null}
					</div>
				</div>
				<p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
					{author.bio ??
						"A longer biography will be published when it is ready."}
				</p>
				<div className="mt-6 flex gap-5 text-sm">
					{author.x ? (
						<a
							href={author.x}
							target="_blank"
							rel="noopener noreferrer"
							className="link-underline"
						>
							X
						</a>
					) : null}
					{author.linkedin ? (
						<a
							href={author.linkedin}
							target="_blank"
							rel="noopener noreferrer"
							className="link-underline"
						>
							LinkedIn
						</a>
					) : null}
				</div>

				<div className="mt-20 border-t border-border pt-12">
					<div className="flex items-end justify-between gap-6">
						<div>
							<p className="eyebrow">Published work</p>
							<h2 className="font-display mt-4 text-3xl">
								Articles by {author.name}
							</h2>
						</div>
						<Link
							href="/blog/all"
							className="link-underline text-sm font-medium text-brand-strong"
						>
							All posts
						</Link>
					</div>
					{author.posts.length ? (
						<div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{author.posts.map((post) => (
								<StoryCard
									key={post._id}
									href={`/blog/${post.slug}`}
									tag={post.categories?.[0]?.title ?? "Story"}
									meta={`${Math.max(1, post.readMins ?? 1)} min read`}
									title={post.title}
									image={post.mainImage}
								/>
							))}
						</div>
					) : (
						<p className="mt-8 text-muted-foreground">
							No published posts yet.
						</p>
					)}
				</div>
			</div>
		</section>
	);
}
