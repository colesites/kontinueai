import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const inputVariants = cva(
	"file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border border-input h-11 w-full min-w-0 rounded-lg bg-card/60 px-4 py-2 text-base shadow-sm transition-[color,box-shadow,background] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-primary/60 focus-visible:ring-primary/30 focus-visible:ring-[3px]",
	{
		variants: {
			variant: {
				default: "",
				glass: "glass focus-visible:bg-accent/45",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Input({
	className,
	type,
	variant,
	...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputVariants({ variant, className }))}
			{...props}
		/>
	);
}

export { Input };
