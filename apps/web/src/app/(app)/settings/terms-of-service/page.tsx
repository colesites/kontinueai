import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <article className="mt-6 rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            By using this service, you agree to use it lawfully and responsibly.
            You are responsible for content you upload and generate.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Service behavior may change as features are improved. Abuse,
            security violations, or policy breaches may result in access
            restrictions.
          </p>
        </article>
      </div>
    </div>
  );
}
