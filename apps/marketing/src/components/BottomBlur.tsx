// Progressive frosted-glass blur fixed to the bottom of the viewport.
// Each layer blurs more and is revealed lower, so content dissolves into
// glass as it nears the bottom edge. Decorative and click-through.
const layers = [
	{ blur: 1, from: 0, to: 22 },
	{ blur: 3, from: 18, to: 46 },
	{ blur: 8, from: 42, to: 72 },
	{ blur: 18, from: 68, to: 92 },
];

export function BottomBlur() {
	return (
		<div
			aria-hidden
			className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-24 sm:h-28 lg:h-32"
		>
			{layers.map((layer) => {
				const mask = `linear-gradient(to bottom, transparent ${layer.from}%, #000 ${layer.to}%)`;
				return (
					<div
						key={layer.blur}
						className="absolute inset-0"
						style={{
							backdropFilter: `blur(${layer.blur}px)`,
							WebkitBackdropFilter: `blur(${layer.blur}px)`,
							maskImage: mask,
							WebkitMaskImage: mask,
						}}
					/>
				);
			})}
			<div className="absolute inset-0 bg-gradient-to-t from-background/35 to-transparent" />
		</div>
	);
}
