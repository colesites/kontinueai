"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TrackedLinkProps = ComponentProps<typeof Link> & {
	eventName: string;
	eventProperties?: Record<string, string | number | boolean>;
	variant?: "default" | "brand" | "outline" | "subtle" | "ghost" | "link";
	size?: "sm" | "default" | "lg" | "icon";
};

export function TrackedLink({
	eventName,
	eventProperties,
	variant = "default",
	size = "default",
	className,
	onClick,
	...props
}: TrackedLinkProps) {
	return (
		<Link
			{...props}
			className={cn(buttonVariants({ variant, size }), className)}
			onClick={(event) => {
				track(eventName, eventProperties);
				onClick?.(event);
			}}
		/>
	);
}
