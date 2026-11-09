import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { AgentScreen } from "../screens/AgentScreen";
import { DeviceStage } from "../three/DeviceStage";
import { type CameraShot, easeInOut, lerpShot, MBP, macbookScreenCorners, range } from "../three/geometry";
import { MacBook } from "../three/MacBook";
import { Room } from "../three/Room";

// Scene 2, "The wall". The agent screen runs on one story clock across the
// three shots: 2A covers 0-5s, 2C 5-9s, 2D 9s onward.

const OPEN = 108;
const SCREEN_TARGET: [number, number, number] = [0, 0.13, -0.15];

const useSeconds = () => {
	const frame = useCurrentFrame();
	const { fps, durationInFrames } = useVideoConfig();
	return { sec: frame / fps, progress: frame / Math.max(1, durationInFrames - 1) };
};

const laptopScreen = (lidDeg: number, t: number, opacity = 1) => ({
	corners: macbookScreenCorners(lidDeg),
	width: MBP.uiW,
	height: MBP.uiH,
	opacity,
	radius: 10,
	content: <AgentScreen t={t} />,
});

/** 2A · Dark room, MacBook open, the agent working. Slow dolly in. */
export const Shot2A: React.FC = () => {
	const { sec, progress } = useSeconds();
	const from: CameraShot = { position: [-0.62, 0.4, 0.98], target: SCREEN_TARGET, lens: 50 };
	const to: CameraShot = { position: [-0.44, 0.31, 0.7], target: SCREEN_TARGET, lens: 50 };
	const camera = lerpShot(from, to, easeInOut(progress));
	return (
		<DeviceStage camera={camera} screens={[laptopScreen(OPEN, sec)]}>
			<Room />
			<MacBook lidDeg={OPEN} />
		</DeviceStage>
	);
};

/** 2C · Full-screen: the prompt goes in, the agent thinks, the limit hits. */
export const Shot2C: React.FC = () => {
	const { sec, progress } = useSeconds();
	const { width, height } = useVideoConfig();
	const fit = Math.max(width / MBP.uiW, height / MBP.uiH);
	const push = 1.0 + 0.1 * easeInOut(progress);
	const vertical = height > width;
	return (
		<AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
			<div
				style={{
					position: "absolute",
					left: "50%",
					top: "50%",
					width: MBP.uiW,
					height: MBP.uiH,
					transformOrigin: vertical ? "8% 45%" : "10% 45%",
					transform: `translate(-50%, -50%) scale(${fit * push})`,
				}}
			>
				<AgentScreen t={5 + sec} />
			</div>
			{/* Vignette */}
			<AbsoluteFill style={{ background: "radial-gradient(ellipse at 40% 55%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
		</AbsoluteFill>
	);
};

/** 2D · The lid slowly closes. The glow dies. */
export const Shot2D: React.FC = () => {
	const { sec, progress } = useSeconds();
	const close = easeInOut(range(sec, 0.6, 3.3));
	const lidDeg = OPEN * (1 - close);
	const glow = range(lidDeg, 4, 30);
	const camera = lerpShot(
		{ position: [0.05, 0.4, 0.78], target: [0, 0.1, -0.08], lens: 45 },
		{ position: [0.04, 0.37, 0.7], target: [0, 0.09, -0.08], lens: 45 },
		easeInOut(progress),
	);
	return (
		<DeviceStage camera={camera} screens={[laptopScreen(lidDeg, 9 + sec, glow)]}>
			<Room lamp={0.6 + 0.4 * glow} />
			<MacBook lidDeg={lidDeg} glow={glow} />
		</DeviceStage>
	);
};
