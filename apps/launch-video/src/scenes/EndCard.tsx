import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts } from "../theme";

// Quiet, Apple-style close: logo settles in, line follows, hold.
export const EndCard: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps, width, height } = useVideoConfig();
	const vertical = height > width;

	const logoIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
	const lineIn = spring({ frame: frame - 18, fps, config: { damping: 200 }, durationInFrames: 30 });
	const blur = interpolate(logoIn, [0, 1], [12, 0]);

	return (
		<AbsoluteFill style={{ background: "#000", alignItems: "center", justifyContent: "center", gap: vertical ? 56 : 44 }}>
			<Img
				src={staticFile("brand/kontinueai.svg")}
				style={{
					width: vertical ? 760 : 820,
					// Source wordmark is dark ink; render it white on black.
					filter: `brightness(0) invert(1) blur(${blur}px)`,
					opacity: logoIn,
					transform: `scale(${interpolate(logoIn, [0, 1], [0.97, 1])})`,
				}}
			/>
			<div
				style={{
					fontFamily: fonts.display,
					fontWeight: 500,
					fontSize: vertical ? 64 : 58,
					letterSpacing: -1.2,
					color: "#d9d9d9",
					opacity: lineIn,
					transform: `translateY(${interpolate(lineIn, [0, 1], [14, 0])}px)`,
					textAlign: "center",
				}}
			>
				Hit your limit? <span style={{ color: "#fff" }}>Keep going.</span>
			</div>
		</AbsoluteFill>
	);
};
