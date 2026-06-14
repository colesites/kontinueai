import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground button-glow hover:-translate-y-px hover:bg-primary/90 active:translate-y-0",
				brand:
					"bg-brand text-brand-foreground button-glow hover:-translate-y-px hover:bg-brand-strong active:translate-y-0",
				outline:
					"border border-border-strong bg-card text-foreground hover:bg-accent hover:border-foreground/25",
				subtle: "bg-secondary text-foreground hover:bg-accent",
				ghost: "text-foreground hover:bg-accent",
				link: "text-foreground underline-offset-4 hover:underline rounded-none",
			},
			size: {
				sm: "h-9 px-4 text-sm",
				default: "h-11 px-6 text-[0.95rem]",
				lg: "h-[3.25rem] px-8 text-base",
				icon: "size-11",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
