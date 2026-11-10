import { ArrowRight, Check, Link2, Mic } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/anim/Reveal";

const sources = [
	{ name: "ChatGPT", src: "/openai.svg" },
	{ name: "Claude", src: "/claude-ai-icon.svg" },
	{ name: "Gemini", src: "/gemini.svg" },
	{ name: "Perplexity", src: "/perplexity.svg" },
];

const switcher = [
	{ name: "K-AI 1.0", src: "/kontinueai-icon.png", note: "Included" },
	{
		name: "Claude",
		src: "/claude-ai-icon.svg",
		note: "Selected",
		active: true,
	},
	{ name: "Gemini", src: "/gemini.svg", note: "Available" },
];

const creations = [
	"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229272/woman-in-urban_hxvo2q.jpg",
	"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229285/cute-face_lnxue9.webp",
];

const connectors = [
	"GitHub",
	"Notion",
	"Gmail",
	"Google Calendar",
	"Google Drive",
	"Todoist",
	"Vercel",
];

// Deterministic bar heights for the voice waveform.
const bars = Array.from({ length: 30 }, (_, i) => ({
	id: `bar-${i}`,
	height: 22 + ((i * 37) % 68),
	delay: ((i * 7) % 12) / 10,
}));

const card =
	"group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-brand/40";
const visual =
	"relative flex h-48 items-center justify-center overflow-hidden border-b border-border bg-secondary/50 px-6";

function Copy({
	title,
	children,
	href,
}: {
	title: string;
	children: React.ReactNode;
	href?: string;
}) {
	return (
		<div className="flex flex-1 flex-col p-6 sm:p-7">
			<h3 className="font-display text-xl tracking-tight">{title}</h3>
			<p className="mt-2 leading-relaxed text-muted-foreground">{children}</p>
			{href ? (
				<Link
					href={href}
					className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-brand-strong after:absolute after:inset-0"
				>
					Learn more
					<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
				</Link>
			) : null}
		</div>
	);
}

export function FeaturesSection() {
	return (
		<section id="features" className="bg-background py-20 lg:py-28">
			<div className="mx-auto max-w-6xl px-5 lg:px-8">
				<Reveal className="mx-auto max-w-2xl text-center">
					<p className="eyebrow">What you get</p>
					<h2 className="font-display tracking-tightest mt-4 text-4xl leading-[1.06] sm:text-5xl">
						One place to finish what you started
					</h2>
					<p className="mt-5 text-lg leading-relaxed text-muted-foreground">
						Your conversations, K-AI 1.0 and leading models live together, so
						one app’s limit never stops your work again.
					</p>
				</Reveal>

				<Reveal stagger={0.07} className="mt-14 grid gap-4 lg:grid-cols-3">
					{/* Import */}
					<div data-anim className={`${card} lg:col-span-2`}>
						<div className={`${visual} flex-col gap-4`}>
							<div className="flex flex-wrap justify-center gap-2">
								{sources.map((source) => (
									<span
										key={source.name}
										className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium"
									>
										<Image
											src={source.src}
											alt=""
											width={16}
											height={16}
											className="size-4 object-contain"
										/>
										{source.name}
									</span>
								))}
							</div>
							<div className="glow-rail w-full max-w-md rounded-full">
								<div className="flex h-12 items-center gap-3 rounded-full bg-card pl-5 pr-1.5">
									<Link2 className="size-4 shrink-0 text-brand" />
									<span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
										https://claude.ai/share/8c1d42e7
									</span>
									<span className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
										Import
									</span>
								</div>
							</div>
						</div>
						<Copy title="Continue any chat" href="/import-ai-conversations">
							Paste a share link from ChatGPT, Claude, Gemini or Perplexity.
							Every message comes over in order.
						</Copy>
					</div>

					{/* Switch models */}
					<div data-anim className={card}>
						<div className={visual}>
							<ul className="w-full max-w-[15rem] space-y-1.5">
								{switcher.map((model) => (
									<li
										key={model.name}
										className={`flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-sm font-medium ${
											model.active
												? "border-brand/50 ring-2 ring-brand/15"
												: "border-border"
										}`}
									>
										<Image
											src={model.src}
											alt=""
											width={16}
											height={16}
											className="size-4 object-contain"
										/>
										{model.name}
										{model.active ? (
											<Check className="ml-auto size-4 text-brand" />
										) : (
											<span className="ml-auto text-[11px] font-normal text-muted-foreground">
												{model.note}
											</span>
										)}
									</li>
								))}
							</ul>
						</div>
						<Copy title="Switch models mid-thread" href="/supported-models">
							When one model runs out or gets it wrong, ask another in the same
							conversation.
						</Copy>
					</div>

					{/* K-AI 1.0 */}
					<div data-anim className={`${card} surface-dark`}>
						<div className={`${visual} bg-transparent`}>
							<div
								aria-hidden
								className="bloom pointer-events-none absolute inset-x-6 -bottom-10 top-10 opacity-70"
							/>
							<div className="relative flex items-center gap-3">
								<Image
									src="/kontinueai-icon.png"
									alt=""
									width={44}
									height={44}
									className="size-11 object-contain brightness-0 invert"
								/>
								<span className="font-display text-5xl tracking-tightest">
									K-AI 1.0
								</span>
							</div>
						</div>
						<Copy title="Our own model, included" href="/kontinue-model">
							K-AI 1.0 comes with every plan, free included, so you always have
							a way forward.
						</Copy>
					</div>

					{/* Voice */}
					<div data-anim className={card}>
						<div className={`${visual} gap-4`}>
							<span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
								<Mic className="size-5" strokeWidth={1.75} />
							</span>
							<div aria-hidden className="flex h-16 items-center gap-[3px]">
								{bars.map((bar) => (
									<span
										key={bar.id}
										className="animate-wave w-[3px] rounded-full bg-brand"
										style={{
											height: `${bar.height}%`,
											animationDelay: `${bar.delay}s`,
										}}
									/>
								))}
							</div>
						</div>
						<Copy title="Voice">
							Talk instead of typing. Record a note and send it as a prompt.
						</Copy>
					</div>

					{/* Images and video */}
					<div data-anim className={card}>
						<div className={`${visual} gap-3 px-5`}>
							{creations.map((src, i) => (
								<div
									key={src}
									className={`relative h-36 w-28 overflow-hidden rounded-2xl border border-border shadow-lg transition-transform duration-500 ${
										i === 0
											? "-rotate-6 group-hover:-rotate-3"
											: "rotate-6 group-hover:rotate-3"
									}`}
								>
									<Image
										src={src}
										alt=""
										fill
										sizes="112px"
										className="object-cover"
									/>
								</div>
							))}
						</div>
						<Copy title="Images and video">
							Generate images in the chat and short video clips in Canvas.
						</Copy>
					</div>

					{/* Projects and connectors */}
					<div
						data-anim
						className={`${card} lg:col-span-3 lg:flex-row lg:items-center`}
					>
						<Copy title="Projects and connectors">
							Group related chats into projects and connect the tools you
							already use.
						</Copy>
						<ul className="flex flex-wrap gap-2 px-6 pb-6 sm:px-7 lg:max-w-xl lg:justify-end lg:p-7">
							{connectors.map((name) => (
								<li
									key={name}
									className="rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-sm font-medium"
								>
									{name}
								</li>
							))}
						</ul>
					</div>
				</Reveal>

				<p className="mt-6 text-center text-sm text-muted-foreground">
					Model, feature and connector availability varies by plan.
				</p>
			</div>
		</section>
	);
}
