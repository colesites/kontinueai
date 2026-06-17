import { SignIn, SignUp } from "@clerk/clerk-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

type AuthMode = "sign-in" | "sign-up";

const closeApp = async () => {
  try {
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
};

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>(() =>
    window.location.hash.includes("sign-up") ? "sign-up" : "sign-in",
  );
  const authCopy = useMemo(
    () =>
      mode === "sign-in"
        ? {
            title: "Kode IDE",
            body: "Sign in to keep your projects, chats, model access, and workspace memory connected.",
            action: "Create account",
            nextMode: "sign-up" as const,
          }
        : {
            title: "Create Kode account",
            body: "Create an account to start building with Kode and your Kontinue AI workspace.",
            action: "Sign in",
            nextMode: "sign-in" as const,
          },
    [mode],
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/74 p-4 text-foreground backdrop-blur-xl">
      <section className="relative grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(145deg,oklch(0.13_0.004_260),oklch(0.09_0.004_260))] shadow-2xl lg:grid-cols-[minmax(320px,0.88fr)_minmax(420px,1fr)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,oklch(0.63_0.239_349_/_0.18),transparent_32%),radial-gradient(circle_at_85%_10%,oklch(0.75_0.17_70_/_0.09),transparent_28%)]" />
        <button
          type="button"
          aria-label="Close Kode"
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-lg text-foreground/55 transition-colors hover:bg-white/[0.06] hover:text-foreground"
          onClick={closeApp}
        >
          <X size={16} />
        </button>

        <div className="relative flex min-h-[440px] flex-col justify-between overflow-hidden border-white/[0.06] border-b p-8 lg:border-r lg:border-b-0 lg:p-9">
          <div className="flex items-center">
            <img
              src="/kontinueai.svg"
              alt="Kontinue AI"
              className="h-9 w-44 object-contain object-left"
            />
          </div>

          <div className="max-w-[25rem]">
            <p className="mb-4 text-brand text-xs font-semibold uppercase tracking-[0.22em]">
              Kontinue AI for builders
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              {authCopy.title}
            </h1>
            <p className="mt-5 max-w-sm text-foreground/62 text-base leading-7">
              {authCopy.body}
            </p>
          </div>

          <div className="max-w-sm border-white/[0.08] border-t pt-5">
            <p className="text-foreground/48 text-sm leading-6">
              Access is required before Kode opens your workspace.
            </p>
          </div>
        </div>

        <div className="relative flex min-h-[440px] items-center justify-center p-5 lg:p-8">
          <div className="w-full max-w-[410px]">
            <div className="mb-4 flex items-center justify-between px-1">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-foreground/62 text-sm transition-colors hover:bg-white/[0.06] hover:text-foreground"
                onClick={closeApp}
              >
                Cancel
              </button>
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
        </div>
      </section>
    </div>
  );
}
