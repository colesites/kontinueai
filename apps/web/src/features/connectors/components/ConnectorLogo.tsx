import Image from "next/image";
import type { ConnectorLogo as Logo } from "../lib/connector-catalog";

// Renders a connector logo, swapping themed variants with the color scheme.
// Uses plain <img> (SVGs are static, in /public) sized to a square.
export function ConnectorLogo({
	logo,
	alt,
	size = 28,
}: {
	logo: Logo;
	alt: string;
	size?: number;
}) {
	if (logo.kind === "single") {
		return (
			<Image
				src={logo.src}
				alt={alt}
				width={size}
				height={size}
				unoptimized
				className="shrink-0"
			/>
		);
	}
	return (
		<>
			<Image
				src={logo.light}
				alt={alt}
				width={size}
				height={size}
				unoptimized
				className="shrink-0 dark:hidden"
			/>
			<Image
				src={logo.dark}
				alt={alt}
				width={size}
				height={size}
				unoptimized
				className="hidden shrink-0 dark:block"
			/>
		</>
	);
}
