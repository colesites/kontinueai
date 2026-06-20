"use client";

import { AGENTS, type AgentDefinition } from "@repo/ai/lib/agents";
import { api } from "@repo/convex/convex/_generated/api";
import { savePendingChatDraft } from "@repo/core/pending-chat-draft";
import { cn } from "@repo/ui/lib/utils";
import { useMutation } from "convex/react";
import {
	ArrowRight,
	Bot,
	CalendarCheck,
	Code2,
	type LucideIcon,
	Megaphone,
	Telescope,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const ICONS: Record<string, LucideIcon> = {
	Telescope,
	Code2,
	Megaphone,
	CalendarCheck,
	Bot,
};

export function AgentsClient() {
	const router = useRouter();
	const pathname = usePathname();
	const createChat = useMutation(api.chats.createChat);
	const [startingId, setStartingId] = useState<string | null>(null);

	// The /agents page is kept in Next's router cache, so navigating to a chat and
	// pressing back restores this component with stale state. Clear the "Starting…"
	// spinner whenever we land back on /agents.
	useEffect(() => {
		if (pathname === "/agents") {
			setStartingId(null);
		}
	}, [pathname]);

	const startChat = async (agent: AgentDefinition, prompt?: string) => {
		if (startingId) return;
		setStartingId(agent.id);
		try {
			const chatId = await createChat({
				title: prompt?.trim().slice(0, 60) || agent.name,
				provider: "unknown",
				importMethod: "manual",
				messages: [],
			});
			if (prompt?.trim()) {
				savePendingChatDraft(String(chatId), { text: prompt });
			}
			router.push(`/chat/${chatId}?agent=${agent.id}`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to start chat";
			toast.error(message);
			setStartingId(null);
		}
	};

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
			<header className="mb-8">
				<p className="eyebrow">Agents</p>
				<div className="mt-2 flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 shadow-[0_4px_18px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
						<Bot size={19} />
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
				</div>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
					Specialized AI agents that share your memory, projects, and tasks.
					Pick one to start a focused conversation.
				</p>
			</header>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{AGENTS.map((agent) => {
					const Icon = ICONS[agent.icon] ?? Bot;
					const isStarting = startingId === agent.id;
					return (
						<div
							key={agent.id}
							className={cn(
								"group surface-card lift-hover flex flex-col rounded-2xl p-5",
								"hover:ring-primary/25",
							)}
						>
							<div className="flex items-start gap-3">
								<div
									className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
									style={{
										backgroundColor: `${agent.color}1a`,
										color: agent.color,
									}}
								>
									<Icon size={20} />
								</div>
								<div className="min-w-0">
									<h2 className="font-semibold leading-tight">{agent.name}</h2>
									<p className="mt-0.5 text-[13px] text-muted-foreground">
										{agent.description}
									</p>
								</div>
							</div>

							<div className="mt-4 flex flex-wrap gap-1.5">
								{agent.capabilities.map((cap) => (
									<span
										key={cap}
										className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-[11.5px] text-muted-foreground"
									>
										{cap}
									</span>
								))}
							</div>

							<div className="mt-4 flex flex-col gap-1.5">
								{agent.suggestedActions.slice(0, 3).map((action) => (
									<button
										key={action}
										type="button"
										disabled={isStarting}
										onClick={() => startChat(agent, action)}
										className={cn(
											"flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[12.5px]",
											"bg-foreground/[0.03] text-muted-foreground transition-colors",
											"hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50",
										)}
									>
										<span className="truncate">{action}</span>
										<ArrowRight size={13} className="shrink-0 opacity-50" />
									</button>
								))}
							</div>

							<button
								type="button"
								disabled={isStarting}
								onClick={() => startChat(agent)}
								className={cn(
									"glow-button mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-primary-foreground",
									"transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100",
								)}
							>
								{isStarting ? "Starting…" : `Chat with ${agent.name}`}
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
