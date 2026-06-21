import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@repo/ui/components/ui/button";
import { Lock } from "lucide-react";
import Link from "next/link";

export default function UnauthorizedPage() {
	return (
		<div className="min-h-screen flex items-center justify-center p-4 bg-background">
			<div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
				<div className="relative inline-block">
					<div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
					<div className="glass-strong relative rounded-2xl p-7">
						<span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25 shadow-[0_0_24px_-6px_color-mix(in_oklch,var(--primary)_55%,transparent)]">
							<Lock className="size-6" />
						</span>
						<h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
							Access restricted
						</h1>
						<p className="mb-6 text-[15px] leading-relaxed text-muted-foreground">
							Kontinue AI is currently in a private beta. Your email address has
							not been whitelisted for access yet.
						</p>

						<div className="space-y-3">
							<Link href="/sign-in" className="block">
								<Button className="glow-button w-full font-semibold text-primary-foreground">
									Try another account
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
