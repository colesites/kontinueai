"use client";

import { useEffect, useRef } from "react";

type Particle = {
	hx: number;
	hy: number;
	x: number;
	y: number;
	phase: number;
	amp: number;
};

// Brand violet (matches --brand) as a robust rgb so canvas fillStyle never
// depends on oklch support.
const PARTICLE_COLOR = "rgb(116, 52, 234)";

/**
 * Renders a word as a field of drifting particles that assemble into its shape.
 * Decorative only — hidden from assistive tech, and static if the user prefers
 * reduced motion.
 */
export function ParticleWordmark({ text = "Kontinue" }: { text?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !parent || !ctx) return;

		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		const fontFamily =
			getComputedStyle(document.body)
				.getPropertyValue("--font-ui-display")
				.trim() || "system-ui, sans-serif";

		let particles: Particle[] = [];
		let width = 0;
		let height = 0;
		let dpr = 1;
		let raf = 0;
		let visible = true;
		let alive = true;
		let pointerX = -9999;
		let pointerY = -9999;
		let mouseRadius = 80;

		function build() {
			if (!canvas || !parent || !ctx) return;
			width = parent.clientWidth;
			const ratio = width < 640 ? 0.46 : width < 1024 ? 0.36 : 0.3;
			height = Math.round(width * ratio);
			mouseRadius = Math.min(140, Math.max(54, height * 0.4));
			dpr = Math.min(window.devicePixelRatio || 1, 2);

			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			// Render the text to an offscreen canvas, then sample its pixels.
			const off = document.createElement("canvas");
			off.width = canvas.width;
			off.height = canvas.height;
			const octx = off.getContext("2d");
			if (!octx) return;
			octx.scale(dpr, dpr);
			octx.fillStyle = "#fff";
			octx.textAlign = "center";
			octx.textBaseline = "middle";

			let fontSize = height * 0.92;
			octx.font = `800 ${fontSize}px ${fontFamily}`;
			const maxWidth = width * 0.98;
			const measured = octx.measureText(text).width;
			if (measured > maxWidth) {
				fontSize *= maxWidth / measured;
				octx.font = `800 ${fontSize}px ${fontFamily}`;
			}
			octx.fillText(text, width / 2, height / 2);

			const data = octx.getImageData(0, 0, canvas.width, canvas.height).data;
			const gap = Math.max(3, Math.round(3.5 * dpr));
			particles = [];
			for (let y = 0; y < canvas.height; y += gap) {
				for (let x = 0; x < canvas.width; x += gap) {
					if (data[(y * canvas.width + x) * 4 + 3] > 128) {
						const hx = x / dpr;
						const hy = y / dpr;
						particles.push({
							hx,
							hy,
							x: reduced ? hx : Math.random() * width,
							y: reduced ? hy : Math.random() * height,
							phase: Math.random() * Math.PI * 2,
							amp: 0.5 + Math.random() * 1.4,
						});
					}
				}
			}
		}

		function draw(time: number) {
			if (!canvas || !ctx) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = PARTICLE_COLOR;
			ctx.globalAlpha = 0.55;

			const rect = canvas.getBoundingClientRect();
			const mx = pointerX - rect.left;
			const my = pointerY - rect.top;
			const r2 = mouseRadius * mouseRadius;

			const t = time * 0.001;
			for (const p of particles) {
				let tx = p.hx + Math.sin(t * 0.8 + p.phase) * p.amp;
				let ty = p.hy + Math.cos(t * 0.7 + p.phase) * p.amp;

				// Push the particle's target away from the cursor.
				const dx = tx - mx;
				const dy = ty - my;
				const d2 = dx * dx + dy * dy;
				const repelling = d2 < r2;
				if (repelling) {
					const dist = Math.sqrt(d2) || 0.001;
					const push = mouseRadius - dist;
					tx += (dx / dist) * push;
					ty += (dy / dist) * push;
				}

				const ease = repelling ? 0.2 : 0.08;
				p.x += (tx - p.x) * ease;
				p.y += (ty - p.y) * ease;
				ctx.beginPath();
				ctx.arc(p.x, p.y, 1.15, 0, Math.PI * 2);
				ctx.fill();
			}

			if (alive && visible) raf = requestAnimationFrame(draw);
		}

		function start() {
			build();
			cancelAnimationFrame(raf);
			if (reduced) {
				draw(0);
			} else if (visible) {
				raf = requestAnimationFrame(draw);
			}
		}

		// Only animate while the footer is on screen.
		const io = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (visible && !reduced && alive) {
					raf = requestAnimationFrame(draw);
				} else {
					cancelAnimationFrame(raf);
				}
			},
			{ rootMargin: "200px" },
		);
		io.observe(canvas);

		let resizeTimer = 0;
		const onResize = () => {
			window.clearTimeout(resizeTimer);
			resizeTimer = window.setTimeout(start, 200);
		};
		window.addEventListener("resize", onResize);

		const onPointerMove = (event: PointerEvent) => {
			pointerX = event.clientX;
			pointerY = event.clientY;
		};
		window.addEventListener("pointermove", onPointerMove, { passive: true });

		document.fonts.ready.then(() => {
			if (alive) start();
		});

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			io.disconnect();
			window.removeEventListener("resize", onResize);
			window.removeEventListener("pointermove", onPointerMove);
		};
	}, [text]);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			className="block w-full [mask-image:linear-gradient(to_bottom,#000_60%,transparent_96%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_60%,transparent_96%)]"
		/>
	);
}
