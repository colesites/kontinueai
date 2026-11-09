import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { hingePosition, lidRotationX, MBP, slabGeometry } from "./geometry";

// Space black 16-inch MacBook Pro. The display itself is a dark glass panel;
// the live UI is laid over it by <DeviceStage>.

const KEY_ROWS = [14, 14, 14, 13, 12, 9];

const keyLayout = () => {
	const kw = 0.28;
	const kd = 0.115;
	const zCenter = -MBP.depth / 2 + 0.012 + kd / 2;
	const rowH = kd / KEY_ROWS.length;
	const gap = 0.0018;
	const keys: { x: number; z: number; w: number; d: number }[] = [];
	KEY_ROWS.forEach((count, ri) => {
		const unit = kw / 14;
		let widths = Array.from({ length: count }, () => unit);
		const extra = kw - unit * count;
		if (extra > 0.0001) {
			widths[0] += extra / 2;
			widths[widths.length - 1] += extra / 2;
		}
		if (ri === 5) {
			widths = [...Array(4).fill(unit), unit * 5, ...Array(4).fill(unit)];
			const s = widths.reduce((a, b) => a + b, 0);
			widths = widths.map((w) => (w * kw) / s);
		}
		const d = ri === 0 ? rowH * 0.6 - gap : rowH - gap;
		const z = ri === 0 ? zCenter - kd / 2 + rowH * 0.3 : zCenter - kd / 2 + rowH * (ri + 0.5);
		let x = -kw / 2;
		for (const w of widths) {
			keys.push({ x: x + w / 2, z, w: w - gap, d });
			x += w;
		}
	});
	return { keys, kw, kd, zCenter };
};

export const MacBook: React.FC<{
	lidDeg: number;
	/** 0..1, how bright the display glows (drives the screen light too). */
	glow?: number;
	position?: [number, number, number];
	rotationY?: number;
}> = ({ lidDeg, glow = 1, position = [0, 0, 0], rotationY = 0 }) => {
	const mats = useMemo(
		() => ({
			alu: new THREE.MeshPhysicalMaterial({ color: "#141518", metalness: 1, roughness: 0.48, envMapIntensity: 0.55 }),
			aluEdge: new THREE.MeshPhysicalMaterial({ color: "#26272b", metalness: 1, roughness: 0.3, envMapIntensity: 1.1 }),
			key: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.75, metalness: 0 }),
			well: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.8 }),
			pad: new THREE.MeshPhysicalMaterial({ color: "#0d0e10", metalness: 0.2, roughness: 0.45, clearcoat: 0.2, envMapIntensity: 0.3 }),
			// Unlit: lit glass would mirror the screen's own area light as a bright band.
			glass: new THREE.MeshBasicMaterial({ color: "#030303" }),
			feet: new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.9 }),
		}),
		[],
	);

	const geos = useMemo(() => {
		const { keys, kw, kd, zCenter } = keyLayout();
		return {
			base: slabGeometry(MBP.width, MBP.depth, MBP.baseH, MBP.radius, 0.0016),
			lid: slabGeometry(MBP.width, MBP.depth, MBP.lidH, MBP.radius, 0.0014),
			key: slabGeometry(1, 1, 0.0007, 0.08, 0, 6),
			pad: slabGeometry(0.158, 0.096, 0.0003, 0.006, 0, 12),
			foot: new THREE.CylinderGeometry(0.009, 0.009, 0.0012, 32),
			keys,
			kw,
			kd,
			zCenter,
		};
	}, []);

	const keysRef = useRef<THREE.InstancedMesh>(null);
	useLayoutEffect(() => {
		const mesh = keysRef.current;
		if (!mesh) return;
		const m = new THREE.Matrix4();
		geos.keys.forEach((k, i) => {
			m.compose(new THREE.Vector3(k.x, MBP.baseH, k.z), new THREE.Quaternion(), new THREE.Vector3(k.w, 1, k.d));
			mesh.setMatrixAt(i, m);
		});
		mesh.instanceMatrix.needsUpdate = true;
	}, [geos]);

	const hinge = hingePosition();
	const lidLen = MBP.depth - MBP.hingeInset * 2;
	const screenCenterZ = MBP.chin + MBP.screenH / 2;

	return (
		<group position={position} rotation={[0, rotationY, 0]}>
			{/* Base */}
			<mesh geometry={geos.base} material={mats.alu} castShadow receiveShadow />
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, MBP.baseH + 0.00005, geos.zCenter]} material={mats.well}>
				<planeGeometry args={[geos.kw + 0.006, geos.kd + 0.006]} />
			</mesh>
			<instancedMesh ref={keysRef} args={[geos.key, mats.key, geos.keys.length]} castShadow />
			<mesh geometry={geos.pad} material={mats.pad} position={[0, MBP.baseH, MBP.depth / 2 - 0.014 - 0.048]} />
			{[-1, 1].flatMap((fx) =>
				[-1, 1].map((fz) => (
					<mesh key={`${fx}${fz}`} geometry={geos.foot} material={mats.feet} position={[fx * (MBP.width / 2 - 0.03), -0.0006, fz * (MBP.depth / 2 - 0.03)]} />
				)),
			)}

			{/* Dark hinge cover between keyboard and display */}
			<mesh position={[0, MBP.baseH + 0.0011, hinge.z + 0.0035]} rotation={[0, 0, Math.PI / 2]} material={mats.feet}>
				<cylinderGeometry args={[0.0028, 0.0028, MBP.width - 0.05, 24]} />
			</mesh>

			{/* Lid, hinged at the back of the base */}
			<group position={hinge} rotation={[lidRotationX(lidDeg), 0, 0]}>
				<mesh geometry={geos.lid} material={mats.alu} position={[0, 0.0002, lidLen / 2]} castShadow receiveShadow />
				{/* Inner glass, facing down when closed = facing the viewer when open */}
				{/* (runs right down to the hinge, like the real black bezel) */}
				<mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0001, (lidLen - 0.0045) / 2]} material={mats.glass}>
					<planeGeometry args={[MBP.width - 0.003, lidLen + 0.0025]} />
				</mesh>
				{/* Screen light: the display lights the keyboard and desk */}
				<rectAreaLight
					position={[0, -0.002, screenCenterZ]}
					// Area lights shine along their local -Z; point it out of the display.
					rotation={[-Math.PI / 2, 0, 0]}
					width={MBP.screenW}
					height={MBP.screenH}
					intensity={0.6 * glow}
					color="#c9d4ff"
				/>
			</group>
		</group>
	);
};
