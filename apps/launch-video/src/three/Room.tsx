import { useMemo } from "react";
import * as THREE from "three";

// The apartment at dawn: walnut desk, charcoal wall, cold window light from the
// left, a warm lamp off to the right, three empty mugs.

const Mug: React.FC<{ position: [number, number, number]; color: string; rotationY?: number }> = ({ position, color, rotationY = 0 }) => {
	const geo = useMemo(() => {
		// Profile of a mug wall, revolved: outside up, lip, inside down.
		const r = 0.041;
		const h = 0.095;
		const t = 0.004;
		const pts = [
			[0, 0],
			[r - 0.004, 0],
			[r, 0.004],
			[r, h - 0.002],
			[r - t / 2, h],
			[r - t, h - 0.002],
			[r - t, 0.012],
			[0, 0.011],
		].map(([x, y]) => new THREE.Vector2(x, y));
		const body = new THREE.LatheGeometry(pts, 64);
		const handle = new THREE.TorusGeometry(0.025, 0.0055, 16, 48, Math.PI * 1.15);
		handle.rotateZ(-Math.PI * 0.575);
		handle.translate(r + 0.004, h * 0.52, 0);
		return { body, handle };
	}, []);
	const mat = useMemo(() => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 }), [color]);
	const coffee = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#120a05", roughness: 0.1, clearcoat: 1 }), []);
	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			<mesh geometry={geo.body} material={mat} castShadow receiveShadow />
			<mesh geometry={geo.handle} material={mat} castShadow />
			<mesh position={[0, 0.0125, 0]} rotation={[-Math.PI / 2, 0, 0]} material={coffee}>
				<circleGeometry args={[0.036, 48]} />
			</mesh>
		</group>
	);
};

export const Room: React.FC<{ lamp?: number; window?: number }> = ({ lamp = 1, window = 1 }) => {
	const walnut = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#2a170c", roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 }), []);
	const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.95 }), []);

	return (
		<>
			{/* Desk */}
			<mesh position={[0, -0.02, 0.05]} material={walnut} receiveShadow>
				<boxGeometry args={[1.8, 0.04, 0.9]} />
			</mesh>
			{/* Back wall */}
			<mesh position={[0, 1, -0.62]} material={wall} receiveShadow>
				<planeGeometry args={[4, 2.4]} />
			</mesh>

			<Mug position={[0.3, 0, -0.1]} color="#d8d6d1" rotationY={-0.6} />
			<Mug position={[0.41, 0, 0.07]} color="#2a2b2e" rotationY={0.9} />
			<Mug position={[-0.33, 0, -0.15]} color="#b9b2a8" rotationY={2.6} />

			<ambientLight intensity={0.04} color="#9fb3ff" />
			{/* Cold dawn window, left */}
			<directionalLight
				position={[-1.4, 1.1, -0.2]}
				intensity={0.85 * window}
				color="#8fb0ff"
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-bias={-0.0004}
				shadow-camera-left={-1}
				shadow-camera-right={1}
				shadow-camera-top={1}
				shadow-camera-bottom={-1}
			/>
			{/* Warm lamp, right */}
			<pointLight position={[0.75, 0.55, -0.35]} intensity={0.35 * lamp} distance={3} decay={2} color="#ffb877" />
			{/* Cool rim from behind to separate the laptop from the wall */}
			<spotLight position={[0.6, 0.6, -0.6]} angle={0.5} penumbra={1} intensity={1.2} color="#b8c6ff" target-position={[0, 0.1, 0]} />
		</>
	);
};
