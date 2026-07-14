"use client";

import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { gsap, useGSAP } from "@/lib/gsap";

export default function NotFound() {
	const router = useRouter();
	const root = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
			tl.fromTo(
				"[data-h='eyebrow']",
				{ autoAlpha: 0, y: 14 },
				{ autoAlpha: 1, y: 0, duration: 0.7 },
			)
				.fromTo(
					"[data-h='title']",
					{ autoAlpha: 0, y: 20 },
					{ autoAlpha: 1, y: 0, duration: 0.8 },
					"-=0.5",
				)
				.fromTo(
					"[data-h='desc']",
					{ autoAlpha: 0, y: 18 },
					{ autoAlpha: 1, y: 0, duration: 0.8 },
					"-=0.6",
				)
				.fromTo(
					"[data-h='cta']",
					{ autoAlpha: 0, y: 18 },
					{ autoAlpha: 1, y: 0, duration: 0.7 },
					"-=0.6",
				);
		},
		{ scope: root },
	);

	return (
		<div
			ref={root}
			className="bg-noise relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-5 pt-28 pb-16 text-center"
		>
			<div
				aria-hidden
				className="bg-grid mask-fade-edges pointer-events-none absolute inset-0 opacity-70"
			/>

			<div className="relative z-10 mx-auto max-w-xl">
				<p
					data-h="eyebrow"
					data-anim
					className="eyebrow inline-flex items-center gap-2"
				>
					<span className="size-1.5 rounded-full bg-brand" />
					Error 404
				</p>

				<h1
					data-h="title"
					data-anim
					className="font-display tracking-tightest mt-6 text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.75rem]"
				>
					Page not <span className="text-brand">found</span>
				</h1>

				<p
					data-h="desc"
					data-anim
					className="mx-auto mt-7 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl"
				>
					The page you're looking for doesn't exist or has been moved. Let's get
					you back on track.
				</p>

				<div
					data-h="cta"
					data-anim
					className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
				>
					<Button asChild size="lg" className="hover-lift w-full sm:w-auto">
						<Link href="/">
							<Home className="mr-2 size-4" />
							Go Home
						</Link>
					</Button>
					<Button
						variant="outline"
						size="lg"
						className="hover-lift w-full sm:w-auto"
						onClick={() => router.back()}
					>
						<ArrowLeft className="mr-2 size-4" />
						Go Back
					</Button>
				</div>
			</div>
		</div>
	);
}
