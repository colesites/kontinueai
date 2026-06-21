import type React from "react";

export function HowToStep({
	icon,
	title,
	description,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<div className="flex items-start gap-3.5">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
				{icon}
			</div>
			<div className="text-left">
				<p className="text-[14px] font-medium text-foreground">{title}</p>
				<p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
		</div>
	);
}
