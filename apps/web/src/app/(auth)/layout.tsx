"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const signUpPathname = pathname.includes("/sign-up");

	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
			{/* Ambient brand glow */}
			<div className="pointer-events-none absolute left-1/2 top-[38%] z-0 h-[360px] w-[640px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-primary/15 blur-[120px]" />

			<div className="relative z-10 w-full max-w-md">
				<div className="mb-8 flex flex-col items-center text-center">
					<Image
						src="/kontinueai.svg"
						alt="Kontinue AI"
						width={150}
						height={30}
						priority
						className="h-7 w-auto invert transition-[filter] dark:invert-0"
					/>
					<p className="mt-4 text-sm text-muted-foreground">
						{signUpPathname
							? "Create an account to get started"
							: "Sign in to continue your AI conversations"}
					</p>
				</div>
				{children}
			</div>
		</div>
	);
}
