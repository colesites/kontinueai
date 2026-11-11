// Settings → Usage → Buy usage credits: Stripe's embedded checkout in a
// Kontinue dialog, so paying never leaves the app. The web app's checkout
// route creates the session and hands back the publishable key of the same
// Stripe account; credits are added by the Stripe webhook, and the usage
// meter updates on its own once they land.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { CircleCheck, Loader2 } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { getSessionToken } from "@/lib/kode-chat";

type Session = { clientSecret: string; stripe: Promise<Stripe | null> };

// One Stripe.js instance per key (test locally, live in the built app).
const stripeByKey = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  let stripe = stripeByKey.get(key);
  if (!stripe) {
    stripe = loadStripe(key);
    stripeByKey.set(key, stripe);
  }
  return stripe;
}

function errorText(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Couldn't start checkout.";
}

export function CreditCheckoutDialog({
  pack,
  onClose,
}: {
  /** The pack being bought; null keeps the dialog closed. */
  pack: { id: string; label: string } | null;
  onClose: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    setSession(null);
    setError(null);
    setPaid(false);
    if (!pack) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getSessionToken();
        if (!token) throw new Error("Your session expired. Sign in again.");
        const result = await invoke<{ clientSecret: string; publishableKey: string }>("kontinue_api_post", {
          path: "/api/billing/credits/checkout",
          sessionToken: token,
          body: { packId: pack.id, embedded: true },
        });
        if (!cancelled) setSession({ clientSecret: result.clientSecret, stripe: stripeFor(result.publishableKey) });
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pack?.id]);

  return (
    <Dialog open={pack !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        size="lg"
        title={paid ? "Payment received" : "Buy usage credits"}
        description={paid ? undefined : pack?.label}
        // Stripe's form shows its own fields; a stray outside click shouldn't throw away a half-filled card.
        onInteractOutside={(event) => event.preventDefault()}
      >
        {paid ? (
          <>
            <DialogBody className="flex flex-col items-center gap-3 py-8 text-center">
              <CircleCheck className="size-9 text-emerald-500" />
              <p className="max-w-sm text-body text-muted-foreground">
                Your credits will show up under Usage in a few seconds. They're used once you reach your plan's limits.
              </p>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={onClose}
                className="kontinue-3d-primary flex h-8 cursor-pointer items-center rounded-full px-4 text-label font-medium"
              >
                Done
              </button>
            </DialogFooter>
          </>
        ) : (
          <DialogBody className="px-3 pb-3">
            {error ? (
              <p className="px-2 py-6 text-center text-label text-rose-400">{error}</p>
            ) : session ? (
              // Stripe draws a light form; give it a light, rounded surface so it sits well in dark mode too.
              <div className="min-h-[420px] overflow-hidden rounded-[14px] bg-white">
                <EmbeddedCheckoutProvider
                  key={session.clientSecret}
                  stripe={session.stripe}
                  options={{ clientSecret: session.clientSecret, onComplete: () => setPaid(true) }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            ) : (
              <p className="flex min-h-[420px] items-center justify-center gap-2 text-label text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Opening secure checkout…
              </p>
            )}
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}
