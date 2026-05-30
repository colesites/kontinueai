"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { cn } from "@repo/ui/lib/utils";
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

  const byProvider = new Map(
    (connectors ?? []).map((c) => [c.provider, c]),
  );

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
          className="mb-6 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Chat
        </button>

        <div className="mb-6 flex items-center gap-2">
          <Plug className="size-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Connectors</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
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
                className="flex items-center gap-4 rounded-xl border border-border/70 bg-card/60 p-4"
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
                  <span className="shrink-0 rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] text-muted-foreground">
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
                      className="rounded-lg border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <a
                    href={def.startPath}
                    className={cn(
                      "shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
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
