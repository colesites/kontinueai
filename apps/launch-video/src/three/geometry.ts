// Shared 3D math for the device shots.
//
// The device screens are real React UI, not textures: the 3D scene draws the
// device, and the UI is laid over the screen as a DOM layer warped (matrix3d)
// onto the screen's projected corners. Text stays sharp and animates live.

import * as THREE from "three";

// ------------------------------------------------------------ MacBook Pro 16

// Real dimensions in meters. Laptop sits on the XZ plane, y up, front = +z.
export const MBP = {
	width: 0.3557,
	depth: 0.2481,
	baseH: 0.0098,
	lidH: 0.0062,
	radius: 0.0105,
	// 16.2" Liquid Retina XDR, 3456 x 2234
	screenW: 0.346,
	screenH: 0.346 * (2234 / 3456),
	// Distance from the hinge to the bottom edge of the display (the "chin").
	chin: 0.0169,
	hingeInset: 0.004,
	// The DOM layer is laid out at the display's logical resolution.
	uiW: 1728,
	uiH: 1117,
};

export const hingePosition = () => new THREE.Vector3(0, MBP.baseH, -MBP.depth / 2 + MBP.hingeInset);

/** Lid rotation: 0 = closed, ~110 = open. */
export const lidRotationX = (openDeg: number) => THREE.MathUtils.degToRad(-openDeg);

/**
 * The display's 4 corners in world space, as the viewer sees them:
 * top-left, top-right, bottom-right, bottom-left.
 */
export const macbookScreenCorners = (openDeg: number, root: THREE.Matrix4 = new THREE.Matrix4()) => {
	const hinge = new THREE.Matrix4()
		.makeTranslation(hingePosition())
		.multiply(new THREE.Matrix4().makeRotationX(lidRotationX(openDeg)));
	const m = root.clone().multiply(hinge);
	const y = -0.00015;
	const zBottom = MBP.chin;
	const zTop = MBP.chin + MBP.screenH;
	const x = MBP.screenW / 2;
	return [
		new THREE.Vector3(-x, y, zTop),
		new THREE.Vector3(x, y, zTop),
		new THREE.Vector3(x, y, zBottom),
		new THREE.Vector3(-x, y, zBottom),
	].map((v) => v.applyMatrix4(m));
};

// ------------------------------------------------------------ shapes

export const roundedRectShape = (w: number, h: number, r: number) => {
	const s = new THREE.Shape();
	const x = -w / 2;
	const y = -h / 2;
	s.moveTo(x + r, y);
	s.lineTo(x + w - r, y);
	s.quadraticCurveTo(x + w, y, x + w, y + r);
	s.lineTo(x + w, y + h - r);
	s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	s.lineTo(x + r, y + h);
	s.quadraticCurveTo(x, y + h, x, y + h - r);
	s.lineTo(x, y + r);
	s.quadraticCurveTo(x, y, x + r, y);
	return s;
};

/**
 * A rounded slab lying flat (XZ plane), from y=0 to y=height, with softened
 * edges. Plan-view corner radius `r`, edge softening `soft`.
 */
export const slabGeometry = (w: number, d: number, height: number, r: number, soft = 0.0012, curveSegments = 24) => {
	const soft2 = Math.min(soft, height / 2.5);
	const geo = new THREE.ExtrudeGeometry(roundedRectShape(w - soft2 * 2, d - soft2 * 2, Math.max(0.0001, r - soft2)), {
		depth: Math.max(0.00001, height - soft2 * 2),
		bevelEnabled: soft2 > 0,
		bevelThickness: soft2,
		bevelSize: soft2,
		bevelSegments: 3,
		curveSegments,
	});
	// Shape is in XY and extrudes along +Z; turn it so it lies flat and grows up.
	geo.rotateX(-Math.PI / 2);
	geo.translate(0, soft2, 0);
	geo.computeVertexNormals();
	return geo;
};

// ------------------------------------------------------------ camera

export type CameraShot = {
	position: [number, number, number];
	target: [number, number, number];
	/** Focal length in mm on a 36mm-wide sensor (landscape). */
	lens: number;
};

/** Vertical FOV that keeps the same horizontal framing in any aspect ratio. */
export const fovFor = (lens: number, aspect: number) =>
	THREE.MathUtils.radToDeg(2 * Math.atan(36 / aspect / 2 / lens));

export const makeCamera = (shot: CameraShot, width: number, height: number) => {
	const cam = new THREE.PerspectiveCamera(fovFor(shot.lens, width / height), width / height, 0.01, 50);
	cam.position.set(...shot.position);
	cam.lookAt(new THREE.Vector3(...shot.target));
	cam.updateMatrixWorld(true);
	cam.updateProjectionMatrix();
	return cam;
};

export const lerpShot = (a: CameraShot, b: CameraShot, t: number): CameraShot => {
	const l = (x: number, y: number) => x + (y - x) * t;
	return {
		position: [l(a.position[0], b.position[0]), l(a.position[1], b.position[1]), l(a.position[2], b.position[2])],
		target: [l(a.target[0], b.target[0]), l(a.target[1], b.target[1]), l(a.target[2], b.target[2])],
		lens: l(a.lens, b.lens),
	};
};

// ------------------------------------------------------------ screen overlay

/** Projects world points to pixel coordinates. */
export const toScreen = (points: THREE.Vector3[], cam: THREE.Camera, width: number, height: number) =>
	points.map((p) => {
		const v = p.clone().project(cam);
		return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height };
	});

/** True when the quad faces the camera (screen corners wind clockwise in pixel space). */
export const facesCamera = (q: { x: number; y: number }[]) => {
	let area = 0;
	for (let i = 0; i < 4; i++) {
		const a = q[i];
		const b = q[(i + 1) % 4];
		area += a.x * b.y - b.x * a.y;
	}
	return area > 0;
};

/**
 * CSS matrix3d that maps a w x h box onto the quad (TL, TR, BR, BL).
 * Solves the 8-unknown homography by Gaussian elimination.
 */
export const quadMatrix3d = (w: number, h: number, q: { x: number; y: number }[]) => {
	const src = [
		[0, 0],
		[w, 0],
		[w, h],
		[0, h],
	];
	const A: number[][] = [];
	const B: number[] = [];
	for (let i = 0; i < 4; i++) {
		const [x, y] = src[i];
		const { x: u, y: v } = q[i];
		A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
		B.push(u);
		A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
		B.push(v);
	}
	const hm = solve(A, B);
	const [a, b, c, d, e, f, g, hh] = hm;
	// Column-major: maps (x, y) -> ((a x + b y + c) / (g x + h y + 1), ...)
	return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
};

const solve = (A: number[][], B: number[]) => {
	const n = B.length;
	const M = A.map((row, i) => [...row, B[i]]);
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
		[M[col], M[pivot]] = [M[pivot], M[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = M[r][col] / M[col][col];
			for (let k = col; k <= n; k++) M[r][k] -= factor * M[col][k];
		}
	}
	return M.map((row, i) => row[n] / row[i]);
};

// ------------------------------------------------------------ easing

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const easeInOut = (t: number) => {
	const x = clamp01(t);
	return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const range = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
