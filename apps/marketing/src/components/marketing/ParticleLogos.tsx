"use client";

// The models and coding agents Kontinue works with, around the homepage
// headline: tilted tiles (as on t3.codes) with each logo drawn in dots like the
// footer wordmark. The dots gather into the logo, the tiles drift and lean
// toward the pointer by their depth, and dots scatter where the pointer passes. Static with reduced motion; hidden on
// small screens; paused while off screen.

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Logo = {
	name: string;
	src: string;
	/** Centre: px from the middle of the hero, and px from its top. */
	dx: number;
	y: number;
	/** Tile size in px, tilt in degrees, and how much it follows the pointer (0 to 1). */
	tile: number;
	rotate: number;
	depth: number;
	/** Recolour the shape with this gradient (top-left to bottom-right). */
	gradient?: string[];
};

// Desktop: close around the headline, two above its corners, two beside it, two beside
// the buttons, and DeepSeek further out on the left.
const LOGOS: Logo[] = [
	{
		name: "OpenCode",
		src: "/logos/opencode.svg",
		dx: -370,
		y: 104,
		tile: 84,
		rotate: -5,
		depth: 0.5,
	},
	{
		name: "Antigravity",
		src: "/logos/antigravity.svg",
		dx: 370,
		y: 104,
		tile: 84,
		rotate: 5,
		depth: 0.55,
		gradient: ["#3186ff", "#8e5cf6", "#ea4335", "#fbbc04"],
	},
	{
		name: "Claude",
		src: "/claude-ai-icon.svg",
		dx: -510,
		y: 236,
		tile: 112,
		rotate: -7,
		depth: 1,
	},
	{
		name: "OpenAI",
		src: "/openai.svg",
		dx: 510,
		y: 236,
		tile: 108,
		rotate: 6,
		depth: 0.9,
	},
	{
		name: "Cursor",
		src: "/logos/cursor.svg",
		dx: -430,
		y: 470,
		tile: 92,
		rotate: 8,
		depth: 0.7,
	},
	{
		name: "Grok",
		src: "/grok-light.svg",
		dx: 430,
		y: 470,
		tile: 92,
		rotate: -8,
		depth: 0.75,
	},
	{
		name: "DeepSeek",
		src: "/logos/deepseek.svg",
		dx: -600,
		y: 370,
		tile: 80,
		rotate: 6,
		depth: 0.6,
	},
];

/** The logo inside a tile takes this share of the tile. */
const GLYPH = 0.52;

/** Below this width the tiles leave the sides of the headline and line up above it. */
const SIDE_LAYOUT_FROM = 1280;

/** Left to right in the row used on phones and tablets (Claude in the middle). */
const ROW_ORDER = [
	"Cursor",
	"DeepSeek",
	"OpenAI",
	"Claude",
	"Antigravity",
	"OpenCode",
	"Grok",
];

type Place = { x: number; y: number; tile: number; rotate: number };

/** Where each logo's tile sits for this width: beside the headline, or in a row above it. */
function placesFor(width: number): Place[] {
	if (width >= SIDE_LAYOUT_FROM) {
		return LOGOS.map((logo) => ({
			x: width / 2 + logo.dx,
			y: logo.y,
			tile: logo.tile,
			rotate: logo.rotate,
		}));
	}
	const tile = Math.max(40, Math.min(66, (width - 40) / 7.4));
	const spacing = Math.min(tile * 1.2, (width - 24 - tile) / 6);
	const base = width < 640 ? 112 : 124;
	return LOGOS.map((logo) => {
		const k = ROW_ORDER.indexOf(logo.name) - 3;
		return {
			x: width / 2 + k * spacing,
			// A gentle arc: the middle tile sits lowest.
			y: base - Math.abs(k) * 4,
			tile: k === 0 ? tile * 1.12 : tile,
			rotate: k === 0 ? 0 : (k % 2 ? 7 : -6) * Math.sign(k),
		};
	});
}

type Dot = {
	logo: number;
	ox: number;
	oy: number;
	x: number;
	y: number;
	phase: number;
	color: string;
};

function loadImage(src: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

export function ParticleLogos({ className }: { className?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		let width = 0;
		let height = 0;
		let dpr = 1;
		let dots: Dot[] = [];
		let groups = new Map<string, Dot[]>();
		let images: (HTMLImageElement | null)[] = [];
		let raf = 0;
		let alive = true;
		let visible = true;
		let pointerX = -9999;
		let pointerY = -9999;
		// Smoothed pointer offset from the centre (-0.5 to 0.5), for the lean.
		let leanX = 0;
		let leanY = 0;
		let places: Place[] = [];
		let repel = 40;
		let dotRadius = 0.85;

		function sample() {
			if (!canvas || !ctx) return;
			const parent = canvas.parentElement;
			if (!parent) return;
			width = parent.clientWidth;
			height = parent.clientHeight;
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;

			places = placesFor(width);
			const compact = width < SIDE_LAYOUT_FROM;
			repel = compact ? 26 : 40;
			const gap = compact ? 1.6 : 2;
			dotRadius = compact ? 0.68 : 0.85;
			dots = [];
			for (const [index, logo] of LOGOS.entries()) {
				const img = images[index];
				if (!img) continue;
				// SVGs without a width/height report 0; draw them square.
				const box = Math.round(places[index].tile * GLYPH);
				const iw = img.naturalWidth || box;
				const ih = img.naturalHeight || box;
				const off = document.createElement("canvas");
				off.width = box;
				off.height = box;
				const octx = off.getContext("2d", { willReadFrequently: true });
				if (!octx) continue;
				const scale = Math.min(box / iw, box / ih);
				const w = iw * scale;
				const h = ih * scale;
				octx.drawImage(img, (box - w) / 2, (box - h) / 2, w, h);
				if (logo.gradient) {
					octx.globalCompositeOperation = "source-in";
					const g = octx.createLinearGradient(0, 0, box, box);
					for (const [i, stop] of logo.gradient.entries()) {
						g.addColorStop(i / (logo.gradient.length - 1), stop);
					}
					octx.fillStyle = g;
					octx.fillRect(0, 0, box, box);
				}
				const data = octx.getImageData(0, 0, box, box).data;
				for (let y = 0; y < box; y += gap) {
					for (let x = 0; x < box; x += gap) {
						const i = (Math.floor(y) * box + Math.floor(x)) * 4;
						if (data[i + 3] < 110) continue;
						// Quantise so dots share a handful of colours (batched drawing).
						const q = (v: number) => Math.round(v / 24) * 24;
						const color = `rgb(${q(data[i])},${q(data[i + 1])},${q(data[i + 2])})`;
						const cx = places[index].x;
						const cy = places[index].y;
						const ox = x - box / 2;
						const oy = y - box / 2;
						const spread = 140;
						dots.push({
							logo: index,
							ox,
							oy,
							x: reduced ? cx + ox : cx + ox + (Math.random() - 0.5) * spread,
							y: reduced ? cy + oy : cy + oy + (Math.random() - 0.5) * spread,
							phase: Math.random() * Math.PI * 2,
							color,
						});
					}
				}
			}
			groups = new Map();
			for (const dot of dots) {
				const list = groups.get(dot.color);
				if (list) list.push(dot);
				else groups.set(dot.color, [dot]);
			}
		}

		function frame(time: number) {
			if (!canvas || !ctx) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);

			const rect = canvas.getBoundingClientRect();
			const mx = pointerX - rect.left;
			const my = pointerY - rect.top;
			const inside =
				mx > -200 && mx < width + 200 && my > -200 && my < height + 200;
			leanX += ((inside ? mx / width - 0.5 : 0) - leanX) * 0.06;
			leanY += ((inside ? my / height - 0.5 : 0) - leanY) * 0.06;
			const t = time * 0.001;

			// Where each logo sits this frame: its spot, a slow bob, and the lean.
			const sway = width < SIDE_LAYOUT_FROM ? 0.4 : 1;
			const centres = LOGOS.map((logo, i) => {
				const place = places[i];
				const angle =
					((place.rotate + Math.sin(t * 0.45 + i * 2.1) * 2) * Math.PI) / 180;
				return {
					x:
						place.x +
						leanX * 60 * logo.depth * sway +
						Math.sin(t * 0.6 + i * 1.3) * 3 * sway,
					y:
						place.y +
						leanY * 44 * logo.depth * sway +
						Math.cos(t * 0.5 + i * 1.7) * 7 * sway,
					cos: Math.cos(angle),
					sin: Math.sin(angle),
					angle,
				};
			});

			// Tiles first: soft light squircle-ish squares with a shadow and a hairline edge.
			for (const [i] of LOGOS.entries()) {
				const c = centres[i];
				const s = places[i].tile;
				ctx.save();
				ctx.translate(c.x, c.y);
				ctx.rotate(c.angle);
				ctx.beginPath();
				ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.27);
				const fill = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
				fill.addColorStop(0, "#ffffff");
				fill.addColorStop(1, "#f1f0eb");
				ctx.fillStyle = fill;
				ctx.shadowColor = "rgba(20, 16, 40, 0.16)";
				ctx.shadowBlur = 28;
				ctx.shadowOffsetY = 12;
				ctx.fill();
				ctx.shadowColor = "transparent";
				ctx.lineWidth = 1;
				ctx.strokeStyle = "rgba(0, 0, 0, 0.07)";
				ctx.stroke();
				ctx.restore();
			}

			const r2 = repel * repel;
			for (const dot of dots) {
				const c = centres[dot.logo];
				// The logo turns with its tile.
				const rx = dot.ox * c.cos - dot.oy * c.sin;
				const ry = dot.ox * c.sin + dot.oy * c.cos;
				let tx = c.x + rx + Math.sin(t * 0.9 + dot.phase) * 0.35;
				let ty = c.y + ry + Math.cos(t * 0.8 + dot.phase) * 0.35;
				const dx = tx - mx;
				const dy = ty - my;
				const d2 = dx * dx + dy * dy;
				const pushing = d2 < r2;
				if (pushing) {
					const dist = Math.sqrt(d2) || 0.001;
					const push = repel - dist;
					tx += (dx / dist) * push;
					ty += (dy / dist) * push;
				}
				const ease = pushing ? 0.2 : 0.075;
				dot.x += (tx - dot.x) * ease;
				dot.y += (ty - dot.y) * ease;
			}

			ctx.globalAlpha = 0.9;
			for (const [color, list] of groups) {
				ctx.fillStyle = color;
				ctx.beginPath();
				for (const dot of list) {
					ctx.moveTo(dot.x + dotRadius, dot.y);
					ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
				}
				ctx.fill();
			}

			if (alive && visible && !reduced) raf = requestAnimationFrame(frame);
		}

		function start() {
			sample();
			cancelAnimationFrame(raf);
			if (reduced) frame(0);
			else if (visible) raf = requestAnimationFrame(frame);
		}

		const io = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				cancelAnimationFrame(raf);
				if (visible && !reduced && alive) raf = requestAnimationFrame(frame);
			},
			{ rootMargin: "100px" },
		);
		io.observe(canvas);

		let resizeTimer = 0;
		const onResize = () => {
			window.clearTimeout(resizeTimer);
			resizeTimer = window.setTimeout(start, 200);
		};
		const onPointerMove = (event: PointerEvent) => {
			pointerX = event.clientX;
			pointerY = event.clientY;
		};
		window.addEventListener("resize", onResize);
		window.addEventListener("pointermove", onPointerMove, { passive: true });

		Promise.all(
			LOGOS.map((logo) => loadImage(logo.src).catch(() => null)),
		).then((loaded) => {
			if (!alive) return;
			// Indexes stay aligned with LOGOS; a logo that failed to load is skipped.
			images = loaded;
			start();
		});

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			io.disconnect();
			window.clearTimeout(resizeTimer);
			window.removeEventListener("resize", onResize);
			window.removeEventListener("pointermove", onPointerMove);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			className={cn("pointer-events-none absolute inset-0", className)}
		/>
	);
}
