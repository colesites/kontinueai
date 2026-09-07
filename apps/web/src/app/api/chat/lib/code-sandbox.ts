// Sandboxed code execution — the mechanism ChatGPT's Code Interpreter and
// Claude's file creation both use.
//
// The model writes a Python script; we run it inside an ephemeral Vercel Sandbox
// microVM with no access to our env, keys or database; anything the script
// writes to the output directory comes back as a file. That indirection is what
// makes the format list open-ended (xlsx, docx, pptx, pdf, csv, charts, zip…)
// instead of a fixed menu of hand-built generators.

import { Sandbox } from "@vercel/sandbox";

// Where the script is expected to leave anything it wants the user to receive.
export const SANDBOX_OUTPUT_DIR = "/vercel/sandbox/output";

// Libraries that cover the formats people actually ask for. Only installed when
// no prebuilt snapshot is configured — see CODE_SANDBOX_SNAPSHOT_ID below.
// Exported so scripts/create-code-sandbox-snapshot.ts bakes the same set.
export const SANDBOX_PYTHON_PACKAGES = [
	"python-docx", // .docx
	"openpyxl", // .xlsx
	"python-pptx", // .pptx
	"reportlab", // .pdf
	"pandas", // data wrangling + .csv
	"matplotlib", // charts as .png/.svg
];

// Refuse anything that would be absurd to hand back through a chat message.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_STDOUT_CHARS = 4000;

export type SandboxFile = {
	name: string;
	bytes: Buffer;
};

export type CodeRunResult =
	| {
			ok: true;
			stdout: string;
			stderr: string;
			exitCode: number;
			files: SandboxFile[];
	  }
	| { ok: false; error: string };

function credentials():
	| { token: string; teamId: string; projectId: string }
	| Record<string, never> {
	const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = process.env;
	if (VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID) {
		return {
			token: VERCEL_TOKEN,
			teamId: VERCEL_TEAM_ID,
			projectId: VERCEL_PROJECT_ID,
		};
	}
	// On a Vercel deployment the SDK authenticates itself via OIDC.
	return {};
}

// True when this environment can actually start a sandbox. Locally that needs
// the three VERCEL_* vars; on Vercel, OIDC covers it.
export function isCodeSandboxConfigured(): boolean {
	if (process.env.CODE_SANDBOX_DISABLED === "1") return false;
	const hasExplicit =
		!!process.env.VERCEL_TOKEN &&
		!!process.env.VERCEL_TEAM_ID &&
		!!process.env.VERCEL_PROJECT_ID;
	const hasOidc = !!process.env.VERCEL_OIDC_TOKEN || !!process.env.VERCEL;
	return hasExplicit || hasOidc;
}

function truncate(text: string): string {
	return text.length > MAX_STDOUT_CHARS
		? `${text.slice(0, MAX_STDOUT_CHARS)}\n…(truncated)`
		: text;
}

/**
 * Run one Python script in a throwaway microVM and return whatever it wrote to
 * the output directory.
 *
 * The sandbox is always torn down, including on failure — a leaked VM bills for
 * its full timeout.
 */
export async function runPythonForFiles(options: {
	code: string;
	timeoutMs?: number;
}): Promise<CodeRunResult> {
	const { code, timeoutMs = 120_000 } = options;
	const snapshotId = process.env.CODE_SANDBOX_SNAPSHOT_ID;

	let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
	try {
		sandbox = await Sandbox.create({
			...credentials(),
			// 1 vCPU (2GB) instead of the 2 vCPU default. Provisioned memory is
			// billed on wall-clock time, so halving it halves the memory cost of
			// every run — and writing a document is not CPU-bound.
			resources: { vcpus: 1 },
			...(snapshotId
				? { source: { type: "snapshot" as const, snapshotId } }
				: { runtime: "python3.13" as const }),
			timeout: timeoutMs,
		});

		// A cold sandbox has a bare Python. Installing the document libraries takes
		// ~30s, which a chat turn cannot afford — set CODE_SANDBOX_SNAPSHOT_ID to a
		// snapshot with these baked in and startup drops to about a second.
		if (!snapshotId) {
			await sandbox.runCommand("pip", [
				"install",
				"--quiet",
				...SANDBOX_PYTHON_PACKAGES,
			]);
		}

		await sandbox.mkDir(SANDBOX_OUTPUT_DIR);
		await sandbox.writeFiles([
			{ path: "/vercel/sandbox/main.py", content: Buffer.from(code, "utf8") },
		]);

		const run = await sandbox.runCommand("python", ["/vercel/sandbox/main.py"]);
		const stdout = truncate(await run.stdout());
		const stderr = truncate(await run.stderr());

		// The script's own listing of what it produced.
		const ls = await sandbox.runCommand("sh", [
			"-c",
			`ls -1 ${SANDBOX_OUTPUT_DIR} 2>/dev/null || true`,
		]);
		const names = (await ls.stdout())
			.split("\n")
			.map((n) => n.trim())
			.filter(Boolean)
			.slice(0, MAX_FILES);

		const files: SandboxFile[] = [];
		for (const name of names) {
			const buf = await sandbox.readFileToBuffer({
				path: `${SANDBOX_OUTPUT_DIR}/${name}`,
			});
			if (!buf) continue;
			if (buf.byteLength > MAX_FILE_BYTES) {
				console.warn("[code-sandbox] skipping oversized file", {
					name,
					bytes: buf.byteLength,
				});
				continue;
			}
			files.push({ name, bytes: buf });
		}

		return { ok: true, stdout, stderr, exitCode: run.exitCode, files };
	} catch (error) {
		console.error("[code-sandbox] run failed", error);
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Sandbox run failed.",
		};
	} finally {
		// Never leave a VM running; it bills until its timeout otherwise.
		await sandbox?.stop().catch((error) => {
			console.error("[code-sandbox] stop failed", error);
		});
	}
}
