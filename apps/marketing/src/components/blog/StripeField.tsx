import { cn } from "@/lib/utils";

// Diagonal-stripe placeholder, used wherever the design shows a hatched field.
export function StripeField({
	label,
	tone = "light",
	className,
}: {
	label?: string;
	tone?: "light" | "violet";
	className?: string;
}) {
	const stripe =
		tone === "violet"
			? "repeating-linear-gradient(135deg, rgba(255,255,255,0.28) 0 1.5px, transparent 1.5px 16px)"
			: "repeating-linear-gradient(135deg, rgba(17,17,20,0.05) 0 1.5px, transparent 1.5px 14px)";
	return (
		<div
			className={cn(
				"relative overflow-hidden",
				tone === "light" && "bg-secondary",
				className,
			)}
		>
			{tone === "violet" && (
				<div className="absolute inset-0 bg-gradient-to-b from-brand-tint via-[oklch(0.74_0.11_295)] to-foreground" />
			)}
			<div className="absolute inset-0" style={{ backgroundImage: stripe }} />
			{label && (
				<span className="absolute inset-0 grid place-items-center font-mono text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground">
					[ {label} ]
				</span>
			)}
		</div>
	);
}
