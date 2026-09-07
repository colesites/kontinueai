/**
 * Build the snapshot that CODE_SANDBOX_SNAPSHOT_ID points at.
 *
 * A cold sandbox has a bare Python, so every run would spend ~25s installing
 * python-docx/openpyxl/python-pptx/reportlab/pandas/matplotlib — billed compute,
 * and far too slow for a chat turn on a 60s route. Baking them into a snapshot
 * drops startup to about a second.
 *
 * Run once (and again whenever PYTHON_PACKAGES changes):
 *
 *   cd apps/web && bun run scripts/create-code-sandbox-snapshot.ts
 *
 * Then put the printed id in .env.local (and in the Vercel project env):
 *
 *   CODE_SANDBOX_SNAPSHOT_ID=snap_...
 */

import { Sandbox } from "@vercel/sandbox";
import { SANDBOX_PYTHON_PACKAGES } from "../src/app/api/chat/lib/code-sandbox";

function credentials() {
	const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = process.env;
	if (VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID) {
		return {
			token: VERCEL_TOKEN,
			teamId: VERCEL_TEAM_ID,
			projectId: VERCEL_PROJECT_ID,
		};
	}
	return {};
}

const sandbox = await Sandbox.create({
	...credentials(),
	runtime: "python3.13",
	resources: { vcpus: 1 },
	timeout: 300_000,
});

try {
	console.log("installing:", SANDBOX_PYTHON_PACKAGES.join(", "));
	const install = await sandbox.runCommand("pip", [
		"install",
		"--quiet",
		...SANDBOX_PYTHON_PACKAGES,
	]);
	if (install.exitCode !== 0) {
		console.error(await install.stderr());
		throw new Error(`pip install failed (exit ${install.exitCode})`);
	}

	const snapshot = await sandbox.snapshot();
	console.log("\nCODE_SANDBOX_SNAPSHOT_ID=%s", snapshot.snapshotId);
} finally {
	await sandbox.stop().catch(() => {});
}
