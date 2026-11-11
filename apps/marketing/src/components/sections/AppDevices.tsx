import {
	ArrowUp,
	ArrowUpRight,
	AudioLines,
	Camera,
	ChevronDown,
	Code2,
	Download,
	Folder,
	Home,
	Image as ImageIcon,
	Lock,
	MessageSquare,
	Mic,
	Moon,
	PanelLeft,
	Plug,
	Plus,
	Search,
} from "lucide-react";
import Image from "next/image";

/**
 * Miniature renders of the desktop and mobile apps. Everything is sized in em
 * against a container-relative font size, so the whole mock scales as one
 * picture with the width it is given.
 */

const projects = [
	{
		name: "todo-demo",
		chats: [
			"Add a clearCompleted(list) function",
			"The test in todos.test.ts fails",
		],
	},
	{ name: "multivrs", chats: ["Dashboard UI redesign"] },
	{ name: "swift-rust", chats: [] },
	{ name: "e-commerce", chats: ["Build an e-commerce storefront"] },
];

const prompts = [
	{ title: "Build a component", note: "Create a modern, responsive React..." },
	{
		title: "Explain architecture",
		note: "Analyze the architecture of this...",
	},
	{ title: "Optimize performance", note: "Review performance bottlenecks..." },
	{ title: "Debug and solve error", note: "I'm encountering an issue with..." },
];

const violet = "oklch(0.72 0.19 300)";

function Wordmark({ className }: { className: string }) {
	return (
		<Image
			src="/kontinueai.svg"
			alt=""
			width={160}
			height={36}
			className={`${className} w-auto object-contain brightness-0 invert`}
		/>
	);
}

function DesktopApp() {
	return (
		<div className="[container-type:inline-size]">
			<div className="glow-rail rounded-[1.6cqw] shadow-2xl shadow-black/60">
				<div
					style={{ fontSize: "1.111cqw" }}
					className="flex aspect-[16/10] overflow-hidden rounded-[inherit] bg-[#0b0b0d] text-white"
				>
					{/* Sidebar */}
					<div className="flex w-[17em] shrink-0 flex-col border-r border-white/10 bg-[#0e0e11] p-[0.9em]">
						<div className="flex items-center gap-[0.8em] text-white/50">
							<PanelLeft className="size-[1.1em]" />
							<Search className="size-[1.1em]" />
						</div>
						<div className="mt-[1em] grid grid-cols-2 rounded-full border border-white/15 p-[0.15em] text-[0.68em] font-medium">
							<span className="flex items-center justify-center gap-[0.5em] py-[0.5em] text-white/60">
								<Home className="size-[1.1em]" />
								Home
							</span>
							<span
								className="flex items-center justify-center gap-[0.5em] rounded-full py-[0.5em]"
								style={{ background: "oklch(0.36 0.16 300)" }}
							>
								<Code2 className="size-[1.1em]" />
								Kode
							</span>
						</div>
						<span
							className="mt-[0.9em] flex items-center gap-[0.6em] rounded-full border px-[1em] py-[0.6em] text-[0.68em] font-semibold"
							style={{
								background: "oklch(0.3 0.13 300)",
								borderColor: "oklch(0.55 0.2 300)",
							}}
						>
							<Plus className="size-[1.1em]" />
							New
						</span>
						<span className="mt-[0.9em] flex items-center gap-[0.7em] px-[1em] text-[0.66em] text-white/60">
							<Plug className="size-[1.1em]" />
							Connectors
						</span>
						<p className="mt-[1.6em] px-[0.4em] text-[0.64em] text-white/50">
							Projects
						</p>
						<ul className="mt-[0.6em] space-y-[0.7em] text-[0.68em]">
							{projects.map((project) => (
								<li key={project.name}>
									<span className="flex items-center gap-[0.6em] font-medium">
										<ChevronDown className="size-[1em] text-white/40" />
										<Folder
											className="size-[1.1em]"
											style={{ color: violet }}
										/>
										{project.name}
									</span>
									{project.chats.length ? (
										project.chats.map((chat) => (
											<span
												key={chat}
												className="mt-[0.55em] flex items-center gap-[0.6em] pl-[2.4em] text-white/55"
											>
												<MessageSquare className="size-[1em] shrink-0" />
												<span className="truncate">{chat}</span>
											</span>
										))
									) : (
										<span className="mt-[0.55em] block pl-[2.4em] text-white/30">
											No chats yet
										</span>
									)}
								</li>
							))}
						</ul>
						<div className="mt-auto flex items-center gap-[0.6em] border-t border-white/10 pt-[0.8em] text-[0.68em]">
							<span className="grid size-[1.9em] place-items-center rounded-full bg-orange-600 font-semibold">
								K
							</span>
							<span className="font-medium">You</span>
							<span className="text-white/50">Pro</span>
						</div>
					</div>

					{/* Main */}
					<div className="flex min-w-0 flex-1 flex-col items-center justify-center px-[2em]">
						<Wordmark className="h-[2.6em]" />
						<p className="font-display mt-[0.5em] text-[2.3em] tracking-tight">
							How can I help you <span style={{ color: violet }}>today</span>?
						</p>
						<div className="mt-[1.3em] flex gap-[0.6em] text-[0.7em] font-medium">
							<span className="flex items-center gap-[0.5em] rounded-full border border-white/15 px-[1em] py-[0.5em]">
								<Camera className="size-[1.1em]" style={{ color: violet }} />
								Snapshot
							</span>
							<span className="flex items-center gap-[0.5em] rounded-full border border-white/15 px-[1em] py-[0.5em]">
								<Download className="size-[1.1em]" style={{ color: violet }} />
								Import session
							</span>
						</div>

						<div className="mt-[1.6em] w-full max-w-[46em] rounded-[1.6em] border border-white/10 bg-white/[0.03] p-[1.2em]">
							<p className="text-[0.82em] text-white/40">
								What should we build or fix? @ for files, / for commands
							</p>
							<div className="mt-[2.4em] flex items-center gap-[0.5em] text-[0.68em] font-semibold">
								<span className="grid size-[2.3em] place-items-center rounded-full border border-white/15">
									<Plus className="size-[1.1em]" />
								</span>
								<span className="flex items-center gap-[0.5em] rounded-full border border-white/15 px-[0.9em] py-[0.55em]">
									Kode 1.0
									<ChevronDown className="size-[1em] text-white/50" />
								</span>
								<span className="flex items-center gap-[0.5em] rounded-full border border-white/15 px-[0.9em] py-[0.55em]">
									<Lock className="size-[1em]" />
									Supervised
								</span>
								<span
									className="flex items-center gap-[0.5em] rounded-full border px-[0.9em] py-[0.55em]"
									style={{
										background: "oklch(0.3 0.13 300)",
										borderColor: "oklch(0.55 0.2 300)",
									}}
								>
									High · 256k
								</span>
								<span className="ml-auto grid size-[2.3em] place-items-center rounded-full border border-white/15">
									<Mic className="size-[1.1em]" />
								</span>
								<span
									className="grid size-[2.3em] place-items-center rounded-full"
									style={{ background: "oklch(0.36 0.16 300)" }}
								>
									<ArrowUp className="size-[1.1em]" />
								</span>
							</div>
						</div>

						<div className="mt-[1.4em] grid w-full max-w-[42em] grid-cols-2 gap-[0.8em]">
							{prompts.map((prompt) => (
								<div
									key={prompt.title}
									className="rounded-[1.2em] border border-white/10 bg-white/[0.03] px-[1.1em] py-[0.9em]"
								>
									<p className="text-[0.72em] font-semibold">{prompt.title}</p>
									<p className="mt-[0.2em] truncate text-[0.64em] text-white/50">
										{prompt.note}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function PhoneApp() {
	return (
		<div className="[container-type:inline-size]">
			<div
				style={{ fontSize: "4.1667cqw" }}
				className="flex aspect-[9/18.5] flex-col rounded-[3.4em] border-[0.55em] border-[#2b2b30] bg-black p-[1.2em] text-white shadow-2xl shadow-black/70"
			>
				<div className="flex items-center justify-between text-white/70">
					<span className="flex items-center gap-[1em] rounded-[1em] border border-white/10 px-[0.9em] py-[0.7em]">
						<PanelLeft className="size-[1.2em]" />
						<Search className="size-[1.2em]" />
						<Plus className="size-[1.2em]" />
					</span>
					<span className="rounded-[1em] border border-white/10 p-[0.7em]">
						<Moon className="size-[1.2em]" />
					</span>
				</div>

				<div className="flex flex-1 flex-col items-center justify-center text-center">
					<Wordmark className="h-[2.4em]" />
					<p className="font-display mt-[0.6em] text-[1.65em] leading-tight tracking-tight text-white/75">
						How can I help you <span className="text-white">today</span>?
					</p>
					<div className="mt-[1.2em] flex items-center gap-[0.7em] text-[0.78em]">
						<span className="text-white/50 underline underline-offset-2">
							How does this work?
						</span>
						<span className="flex items-center gap-[0.4em] rounded-full border border-white/25 px-[0.9em] py-[0.5em] font-medium">
							<ArrowUpRight className="size-[1.1em]" />
							Import shared link
						</span>
					</div>
				</div>

				<div
					className="rounded-[1.8em] border-t p-[1.1em]"
					style={{
						background: "rgba(255,255,255,0.07)",
						borderColor: "rgba(255,255,255,0.25)",
						boxShadow: "0 -2.5em 4em -1.5em rgba(255,255,255,0.14)",
					}}
				>
					<p className="text-[0.95em] text-white/45">Ask anything...</p>
					<div className="mt-[1.4em] flex items-center gap-[0.5em] text-[0.74em] font-medium">
						<span className="grid size-[2.4em] place-items-center rounded-full border border-white/15">
							<Plus className="size-[1.1em]" />
						</span>
						<span className="flex items-center gap-[0.4em] rounded-full border border-white/15 px-[0.8em] py-[0.55em]">
							K-AI 1.0
							<ChevronDown className="size-[1em] text-white/50" />
						</span>
						<span className="flex items-center gap-[0.4em] text-white/50">
							<ImageIcon className="size-[1.2em]" />
							Auto
						</span>
						<span className="ml-auto grid size-[2.7em] place-items-center rounded-full bg-white text-black">
							<AudioLines className="size-[1.3em]" />
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function AppDevices() {
	return (
		<div aria-hidden className="relative mx-auto max-w-5xl pb-[7%] sm:pr-[6%]">
			<div className="bloom pointer-events-none absolute inset-x-[10%] top-[10%] bottom-0 opacity-70" />
			<div className="relative">
				<DesktopApp />
			</div>
			<div className="absolute bottom-0 right-0 w-[30%] sm:w-[22%]">
				<PhoneApp />
			</div>
		</div>
	);
}
