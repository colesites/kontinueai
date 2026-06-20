import Image from "next/image";
import {
	PortableText,
	type PortableTextBlock,
	type PortableTextComponents,
} from "next-sanity";
import { urlFor } from "@/sanity/lib/image";

const components: PortableTextComponents = {
	types: {
		image: ({ value }) => {
			if (!value?.asset) return null;
			return (
				<figure className="my-10">
					<Image
						src={urlFor(value).width(1600).fit("max").auto("format").url()}
						alt={value.alt || ""}
						width={1600}
						height={900}
						className="w-full rounded-2xl border border-border"
					/>
					{value.caption && (
						<figcaption className="mt-3 text-center text-sm text-muted-foreground">
							{value.caption}
						</figcaption>
					)}
				</figure>
			);
		},
	},
	block: {
		normal: ({ children }) => (
			<p className="mb-6 text-lg leading-[1.8] text-foreground/85">
				{children}
			</p>
		),
		h2: ({ children }) => (
			<h2 className="font-display tracking-tight mt-14 mb-5 text-3xl leading-tight">
				{children}
			</h2>
		),
		h3: ({ children }) => (
			<h3 className="font-display tracking-tight mt-10 mb-4 text-2xl leading-tight">
				{children}
			</h3>
		),
		h4: ({ children }) => (
			<h4 className="font-display mt-8 mb-3 text-xl leading-tight">
				{children}
			</h4>
		),
		blockquote: ({ children }) => (
			<blockquote className="my-10 border-l-[3px] border-brand pl-6 text-2xl font-medium leading-snug text-foreground">
				{children}
			</blockquote>
		),
	},
	list: {
		bullet: ({ children }) => (
			<ul className="mb-6 ml-1 list-disc space-y-2.5 pl-5 text-lg leading-[1.8] text-foreground/85 marker:text-foreground/50">
				{children}
			</ul>
		),
		number: ({ children }) => (
			<ol className="mb-6 ml-1 list-decimal space-y-2 pl-5 text-lg leading-[1.8] text-foreground/85 marker:text-muted-foreground">
				{children}
			</ol>
		),
	},
	listItem: {
		bullet: ({ children }) => <li className="pl-1.5">{children}</li>,
		number: ({ children }) => <li className="pl-1.5">{children}</li>,
	},
	marks: {
		strong: ({ children }) => (
			<strong className="font-semibold text-foreground">{children}</strong>
		),
		em: ({ children }) => <em className="italic">{children}</em>,
		code: ({ children }) => (
			<code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
				{children}
			</code>
		),
		link: ({ children, value }) => {
			const href = (value?.href as string) || "#";
			const external = /^https?:\/\//.test(href);
			return (
				<a
					href={href}
					className="link-underline font-medium text-brand-strong"
					{...(external
						? { target: "_blank", rel: "noopener noreferrer" }
						: {})}
				>
					{children}
				</a>
			);
		},
	},
};

export function PortableTextBody({ value }: { value?: PortableTextBlock[] }) {
	if (!value?.length) return null;
	return <PortableText value={value} components={components} />;
}
