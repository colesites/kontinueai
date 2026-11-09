import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { type CameraShot, facesCamera, fovFor, makeCamera, quadMatrix3d, toScreen } from "./geometry";

RectAreaLightUniformsLib.init();

const CameraRig: React.FC<{ shot: CameraShot }> = ({ shot }) => {
	const { camera, size } = useThree();
	useLayoutEffect(() => {
		const cam = camera as THREE.PerspectiveCamera;
		cam.fov = fovFor(shot.lens, size.width / size.height);
		cam.near = 0.01;
		cam.far = 50;
		cam.position.set(...shot.position);
		cam.lookAt(new THREE.Vector3(...shot.target));
		cam.updateProjectionMatrix();
	}, [camera, shot, size]);
	return null;
};

/** Soft studio reflections for metal and glass, built locally (no HDRI download). */
const Reflections: React.FC<{ intensity: number }> = ({ intensity }) => {
	const { gl, scene } = useThree();
	const env = useMemo(() => {
		const pmrem = new THREE.PMREMGenerator(gl);
		const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		pmrem.dispose();
		return tex;
	}, [gl]);
	useLayoutEffect(() => {
		scene.environment = env;
		scene.environmentIntensity = intensity;
	}, [scene, env, intensity]);
	return null;
};

export type ScreenLayer = {
	/** World-space corners: top-left, top-right, bottom-right, bottom-left. */
	corners: THREE.Vector3[];
	/** Logical size the UI is laid out at. */
	width: number;
	height: number;
	opacity?: number;
	radius?: number;
	content: React.ReactNode;
};

/**
 * A 3D scene plus live DOM screens pinned onto device displays.
 */
export const DeviceStage: React.FC<{
	camera: CameraShot;
	screens?: ScreenLayer[];
	envIntensity?: number;
	background?: string;
	children: React.ReactNode;
}> = ({ camera, screens = [], envIntensity = 0.35, background = "#000", children }) => {
	const { width, height } = useVideoConfig();
	const cam = useMemo(() => makeCamera(camera, width, height), [camera, width, height]);

	return (
		<AbsoluteFill style={{ background }}>
			<ThreeCanvas
				width={width}
				height={height}
				shadows
				gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, preserveDrawingBuffer: true }}
				camera={{ fov: 30, position: camera.position }}
			>
				<CameraRig shot={camera} />
				<Reflections intensity={envIntensity} />
				{children}
			</ThreeCanvas>

			{screens.map((s, i) => {
				const quad = toScreen(s.corners, cam, width, height);
				if (!facesCamera(quad) || (s.opacity ?? 1) <= 0) return null;
				return (
					<div
						key={i}
						style={{
							position: "absolute",
							left: 0,
							top: 0,
							width: s.width,
							height: s.height,
							transformOrigin: "0 0",
							transform: quadMatrix3d(s.width, s.height, quad),
							opacity: s.opacity ?? 1,
							overflow: "hidden",
							borderRadius: s.radius ?? 0,
						}}
					>
						{s.content}
						{/* Glass: a faint sheen across the display */}
						<div
							style={{
								position: "absolute",
								inset: 0,
								background: "linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.0) 38%, rgba(255,255,255,0.0) 70%, rgba(255,255,255,0.03) 100%)",
								pointerEvents: "none",
							}}
						/>
					</div>
				);
			})}
		</AbsoluteFill>
	);
};
