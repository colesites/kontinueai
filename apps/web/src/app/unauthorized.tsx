import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { Lock } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <div className="relative bg-secondary/50 border border-border p-6 rounded-2xl shadow-2xl backdrop-blur-sm">
            <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Access Restricted
            </h1>
            <p className="text-foreground/90 text-lg leading-relaxed mb-6">
              Kontinue AI is currently in a private beta. Your email address has
              not been whitelisted for access yet.
            </p>

            <div className="space-y-3">
              <Link href="/sign-in" className="block">
                <Button className="w-full font-semibold shadow-lg shadow-primary/20">
                  Try Another Account
                </Button>
              </Link>

              <SignOutButton>
                <Button
                  variant="outline"
                  className="w-full border-border/50 hover:bg-secondary/80"
                >
                  Sign Out
                </Button>
              </SignOutButton>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          If you believe this is an error, please contact support at{" "}
          <a
            href="mailto:support@kontinueai.com"
            className="text-primary hover:underline"
          >
            support@kontinueai.com
          </a>
        </p>
      </div>
    </div>
  );
}
