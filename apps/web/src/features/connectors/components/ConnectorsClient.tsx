"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, Loader2, Plug } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { CONNECTORS } from "../lib/connector-catalog";
import { ConnectorLogo } from "./ConnectorLogo";

export function ConnectorsClient() {
	const router = useRouter();
	const params = useSearchParams();
	const connectors = useQuery(api.connectors.listConnectors, {});
	const disconnect = useMutation(api.connectors.disconnect);

	// Surface OAuth callback result, then strip the query params.
	useEffect(() => {
		const connector = params.get("connector");
		const status = params.get("status");
		if (!connector || !status) return;
		const def = CONNECTORS.find((c) => c.provider === connector);
		const name = def?.name ?? connector;
		if (status === "connected") toast.success(`${name} connected.`);
		else if (status === "error")
			toast.error(`Couldn’t connect ${name}. Try again.`);
		router.replace("/settings/connectors");
	}, [params, router]);

	const byProvider = new Map((connectors ?? []).map((c) => [c.provider, c]));

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
				<button
					type="button"
					onClick={() => {
						let returnTo = "/";
						try {
							returnTo = sessionStorage.getItem("connectors:returnTo") ?? "/";
						} catch {
							// ignore storage failures
						}
						router.push(returnTo);
					}}
					className="surface-inset group mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground"
				>
					<ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
					Back to chat
				</button>

				<p className="eyebrow">Integrations</p>
				<div className="mt-2 flex items-center gap-3">
					<span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20 shadow-[0_4px_18px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
						<Plug className="size-5" />
					</span>
					<h1 className="text-3xl font-semibold tracking-tight">Connectors</h1>
				</div>
				<p className="mb-6 mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
					Connect external services so your assistant can act on your behalf.
					Tokens are encrypted at rest and never shared.
				</p>

				<div className="space-y-3">
					{CONNECTORS.map((def) => {
						const conn = byProvider.get(def.provider);
						const isConnected = !!conn?.connected;
						const isAvailable = def.status === "available";
						return (
							<div
								key={def.provider}
								className="surface-card lift-hover flex items-center gap-4 rounded-xl p-4 hover:ring-primary/20"
							>
								<ConnectorLogo logo={def.logo} alt={def.name} />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="font-medium">{def.name}</span>
										{isConnected && conn?.accountLabel && (
											<span className="truncate text-xs text-muted-foreground">
												@{conn.accountLabel}
											</span>
										)}
									</div>
									<p className="truncate text-xs text-muted-foreground">
										{def.description}
									</p>
								</div>

								{!isAvailable ? (
									<span className="surface-inset shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
										Coming soon
									</span>
								) : isConnected ? (
									<div className="flex shrink-0 items-center gap-2">
										<span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
											<Check className="size-3.5" />
											Connected
										</span>
										<button
											type="button"
											onClick={() => {
												void disconnect({ provider: def.provider }).then(() =>
													toast.success(`${def.name} disconnected.`),
												);
											}}
											className="surface-inset rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
										>
											Disconnect
										</button>
									</div>
								) : (
									<a
										href={def.startPath}
										className={cn(
											"glow-button shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-transform duration-200 hover:scale-105 active:scale-95",
										)}
									>
										Connect
									</a>
								)}
							</div>
						);
					})}

					{connectors === undefined && (
						<div className="flex items-center justify-center py-6 text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
