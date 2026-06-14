import { SignIn, SignUp } from "@clerk/clerk-react";
import { Code2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

type AuthMode = "sign-in" | "sign-up";

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>(() =>
    window.location.hash.includes("sign-up") ? "sign-up" : "sign-in",
  );
  const authCopy = useMemo(
    () =>
      mode === "sign-in"
        ? {
            title: "Kode IDE",
            body: "Sign in to sync projects, chats, model access, and workspace memory through Convex.",
            action: "Create account",
            nextMode: "sign-up" as const,
          }
        : {
            title: "Create Kode account",
            body: "Start on the free model tier, then unlock Pro routing when billing is attached.",
            action: "Sign in",
            nextMode: "sign-in" as const,
          },
    [mode],
  );

  return (
    <main className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="flex min-h-[42vh] flex-col justify-between overflow-hidden border-white/[0.06] border-b p-8 lg:min-h-screen lg:border-r lg:border-b-0 lg:p-10">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-primary-foreground">
            <Code2 size={18} />
          </span>
          <span>Kode</span>
        </div>

        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-foreground/60 text-xs">
            <ShieldCheck size={14} className="text-brand" />
            Convex-backed identity
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            {authCopy.title}
          </h1>
          <p className="mt-4 max-w-xl text-foreground/62 text-sm leading-6 sm:text-base">
            {authCopy.body}
          </p>
        </div>

        <div className="grid max-w-3xl grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {["kode-1.0", "Starter routing", "Pro model pool"].map((item) => (
            <div
              key={item}
              className="surface-inset rounded-xl px-3 py-3 text-foreground/68"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 lg:p-8">
        <div className="w-full max-w-[390px]">
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-foreground/62 text-sm transition-colors hover:bg-white/[0.06] hover:text-foreground"
              onClick={() => setMode(authCopy.nextMode)}
            >
              {authCopy.action}
            </button>
          </div>

          {mode === "sign-in" ? (
            <SignIn
              routing="hash"
              signUpUrl="#/sign-up"
              fallbackRedirectUrl="/"
            />
          ) : (
            <SignUp
              routing="hash"
              signInUrl="#/sign-in"
              fallbackRedirectUrl="/"
            />
          )}
        </div>
      </section>
    </main>
  );
}
