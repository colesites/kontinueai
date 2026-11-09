import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Shot } from "../shots";
import { colors, fonts } from "../theme";

const kindLabel: Record<Shot["kind"], string> = {
	"3d": "3D TO BUILD",
	screen: "SCREEN TO BUILD",
	motion: "MOTION TO BUILD",
	card: "CARD TO BUILD",
};

const kindColor: Record<Shot["kind"], string> = {
	"3d": "#f5a524",
	motion: colors.brandSoft,
	screen: colors.brandSoft,
	card: colors.brandSoft,
};

// Placeholder shown for any shot whose footage or screen isn't ready yet, so
// the full cut can be watched for timing from day one.
export const Slate: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
	const frame = useCurrentFrame();
	const { fps, width, height, durationInFrames } = useVideoConfig();
	const vertical = height > width;
	const scale = vertical ? 0.9 : 1;

	return (
		<AbsoluteFill
			style={{
				background: "#0b0b0c",
				color: "#e8e8e8",
				fontFamily: fonts.body,
				padding: vertical ? 72 : 96,
				justifyContent: "space-between",
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", fontFamily: fonts.mono, fontSize: 26 * scale, color: "#8a8a8a" }}>
				<span>
					#{String(index + 1).padStart(2, "0")} · {shot.scene.toUpperCase()}
				</span>
				<span style={{ color: kindColor[shot.kind] }}>{kindLabel[shot.kind]}</span>
			</div>

			<div>
				<div style={{ fontFamily: fonts.display, fontSize: 150 * scale, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
					{shot.id}
				</div>
				<div style={{ marginTop: 28, fontSize: 44 * scale, lineHeight: 1.3, maxWidth: 1400, color: "#f2f2f2" }}>
					{shot.description}
				</div>
				{shot.text ? (
					<div style={{ marginTop: 24, fontFamily: fonts.display, fontSize: 52 * scale, fontWeight: 600, color: "#fff" }}>“{shot.text}”</div>
				) : null}
				{shot.sound ? (
					<div style={{ marginTop: 24, fontFamily: fonts.mono, fontSize: 30 * scale, lineHeight: 1.5, color: colors.brandSoft, maxWidth: 1400 }}>
						Sound: {shot.sound}
					</div>
				) : null}
			</div>

			<div style={{ display: "flex", justifyContent: "space-between", fontFamily: fonts.mono, fontSize: 24 * scale, color: "#6b6b6b" }}>
				<span>{shot.kind === "3d" ? "@remotion/three" : "React"}</span>
				<span>
					{(frame / fps).toFixed(1)}s / {(durationInFrames / fps).toFixed(1)}s
				</span>
			</div>
		</AbsoluteFill>
	);
};
