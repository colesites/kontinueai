import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
          <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We collect only the information needed to operate the product,
            improve reliability, and provide support. Uploaded files and chat
            data are processed to deliver requested features.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Data access is restricted to authorized systems and operators.
            We do not sell personal information.
          </p>
        </article>
      </div>
    </div>
  );
}
