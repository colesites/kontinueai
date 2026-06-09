import Image from "next/image";
import Link from "next/link";

export function Footer() {
	return (
		<footer className="border-t border-border/40 py-16 px-4">
			<div className="container mx-auto">
				<div className="grid gap-10 md:grid-cols-4">
					<div>
						<div className="mb-4">
							<Image
								src="/kontinueai.svg"
								alt="Kontinue AI logo"
								width={120}
								height={32}
								className="h-6 w-auto object-contain"
							/>
						</div>
						<p className="text-sm text-muted-foreground">
							All your AI chats. One workspace. One plan.
						</p>
					</div>

					<div>
						<h4 className="text-sm font-semibold mb-4">Product</h4>
						<ul className="space-y-2 text-sm text-muted-foreground">
							<li>
								<Link
									href="/#features"
									className="hover:text-foreground transition-colors"
								>
									Features
								</Link>
							</li>
							<li>
								<Link
									href="/#use-cases"
									className="hover:text-foreground transition-colors"
								>
									Use Cases
								</Link>
							</li>
							<li>
								<Link
									href="/#pricing"
									className="hover:text-foreground transition-colors"
								>
									Pricing
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h4 className="text-sm font-semibold mb-4">Support</h4>
						<ul className="space-y-2 text-sm text-muted-foreground">
							<li>
								<Link
									href="/#faq"
									className="hover:text-foreground transition-colors"
								>
									FAQ
								</Link>
							</li>
							<li>
								<Link
									href="https://chat.kontinueai.com/sign-up"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-colors"
								>
									Sign up
								</Link>
							</li>
							<li>
								<a
									href="mailto:support@kontinueai.com"
									className="hover:text-foreground transition-colors"
								>
									Contact
								</a>
							</li>
						</ul>
					</div>

					<div>
						<h4 className="text-sm font-semibold mb-4">Legal</h4>
						<ul className="space-y-2 text-sm text-muted-foreground">
							<li>
								<Link
									href="/legal/privacy-policy"
									className="hover:text-foreground transition-colors"
								>
									Privacy Policy
								</Link>
							</li>
							<li>
								<Link
									href="/legal/terms-of-service"
									className="hover:text-foreground transition-colors"
								>
									Terms of Service
								</Link>
							</li>
						</ul>
					</div>
				</div>

				<div className="mt-12 pt-8 border-t border-border/40 text-center text-xs text-muted-foreground">
					<p>
						&copy; {new Date().getFullYear()} Kontinue AI. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}
