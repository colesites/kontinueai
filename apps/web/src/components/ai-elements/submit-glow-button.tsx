"use client";

import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

type SubmitGlowButtonProps = React.ComponentProps<"button"> & {
	/** When true, a click fires the glow bloom + ripple. */
	burst?: boolean;
};

type Ripple = { id: number; size: number; x: number; y: number };

/**
 * Round submit button: on press it blooms a soft primary glow, then a ripple
 * expands outward from the exact press point. Used by both the chat composer
 * send and the canvas generate button.
 */
export const SubmitGlowButton = React.forwardRef<
	HTMLButtonElement,
	SubmitGlowButtonProps
>(function SubmitGlowButton(
	{ className, burst = true, onClick, children, ...props },
	forwardedRef,
) {
	const innerRef = React.useRef<HTMLButtonElement>(null);
	React.useImperativeHandle(
		forwardedRef,
		() => innerRef.current as HTMLButtonElement,
	);
	const [ripple, setRipple] = React.useState<Ripple | null>(null);

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		if (burst && !props.disabled) {
			const reduce =
				typeof window !== "undefined" &&
				window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
			const el = innerRef.current;
			if (!reduce && el) {
				const rect = el.getBoundingClientRect();
				const size = Math.max(rect.width, rect.height) * 2;
				// Keyboard activation has no pointer coords — ripple from the center.
				const hasPoint = e.clientX !== 0 || e.clientY !== 0;
				const x = hasPoint ? e.clientX - rect.left : rect.width / 2;
				const y = hasPoint ? e.clientY - rect.top : rect.height / 2;
				setRipple({ id: Date.now(), size, x, y });
			}
		}
		onClick?.(e);
	};

	return (
		<button
			ref={innerRef}
			type="button"
			onClick={handleClick}
			className={cn("relative", className)}
			{...props}
		>
			{children}
			{ripple && (
				<React.Fragment key={ripple.id}>
					<span aria-hidden className="send-glow" />
					<span
						aria-hidden
						className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
					>
						<span
							className="send-ripple"
							style={{
								width: ripple.size,
								height: ripple.size,
								left: ripple.x,
								top: ripple.y,
							}}
						/>
					</span>
				</React.Fragment>
			)}
		</button>
	);
});
