// Starts the Google agents the way the desktop app does and fails if one of
// them doesn't answer: Antigravity (downloaded from the ACP Registry for this
// computer) and Gemini CLI (npx). Each must reply to `initialize` and then to
// `session/new`. Without a sign-in `session/new` answers "Authentication
// required", which passes: it proves the agent is up and speaking ACP. A hang
// (Antigravity 1.4.5/1.5.0 on Intel Macs spun forever in libffi), a crash or
// output that isn't JSON-RPC fails.
//
//   node apps/desktop/scripts/smoke-acp-agents.mjs                # both
//   node apps/desktop/scripts/smoke-acp-agents.mjs antigravity    # one
//
// Runs in CI on macOS, Windows and Linux (.github/workflows/_desktop.yml).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REGISTRY = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
// Generous: a cold `npx` download of Gemini CLI alone can take over a minute.
const STEP_TIMEOUT_MS = 180_000;

/** Same names as acp_registry.rs `platform()`. */
function platform() {
  const os_ = { darwin: "darwin", linux: "linux", win32: "windows" }[process.platform];
  const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch];
  return os_ && arch ? `${os_}-${arch}` : "unknown";
}

/** fetch with a few retries: CI networks drop the odd request. */
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} from ${url}`);
      return response;
    } catch (error) {
      if (attempt >= 3) throw new Error(`Download failed: ${error.cause?.message ?? error.message} (${url})`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

let registry;
async function registryAgent(id) {
  registry ??= (await download(REGISTRY)).json();
  const agent = (await registry).agents.find((a) => a.id === id);
  if (!agent) throw new Error(`${id} is not in the ACP Registry.`);
  return agent;
}

/** Download, check and unpack like acp_registry.rs `install_inner`. Returns [program, args]. */
async function installBinary(agent, work) {
  const target = agent.distribution.binary?.[platform()];
  if (!target) throw new Error(`${agent.name} has no download for ${platform()}.`);
  const response = await download(target.archive);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (target.sha256 && sha !== target.sha256.toLowerCase()) {
    throw new Error(`Checksum mismatch for ${target.archive}: got ${sha}`);
  }
  const archive = path.join(work, path.basename(new URL(target.archive).pathname));
  const dest = path.join(work, agent.id);
  mkdirSync(dest, { recursive: true });
  writeFileSync(archive, bytes);
  if (!archive.endsWith(".zip")) throw new Error(`Unexpected archive type: ${archive}`);
  // Windows' tar (bsdtar) reads zips; the Linux and macOS runners have unzip.
  if (process.platform === "win32") execFileSync("tar", ["-xf", archive, "-C", dest]);
  else execFileSync("unzip", ["-q", "-o", archive, "-d", dest]);

  const program = path.join(dest, target.cmd.replace(/^\.\//, ""));
  if (!existsSync(program)) throw new Error(`${target.cmd} is missing from the download.`);
  if (process.platform !== "win32") execFileSync("chmod", ["+x", program]);
  // acp_registry.rs `repair_macos_par_signature`.
  if (platform() === "darwin-x86_64" && program.endsWith(".par")) {
    // codesign -d prints to stderr.
    const info = spawnSync("codesign", ["-d", "-v", program], { encoding: "utf8" }).stderr ?? "";
    if (info.includes("(runtime)")) spawnSync("codesign", ["--force", "--sign", "-", program]);
  }
  console.log(`  ${agent.name} ${agent.version} for ${platform()}`);
  return [program, target.args ?? []];
}

/** Speak just enough ACP: initialize, then session/new. */
function handshake(name, program, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      // npx is a .cmd on Windows.
      shell: process.platform === "win32" && !program.endsWith(".exe"),
    });
    let stderr = "";
    let buffer = "";
    let timer;
    const pending = new Map();
    const fail = (message) => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(new Error(`${name}: ${message}${stderr.trim() ? `\n  stderr: ${stderr.trim().slice(-1500)}` : ""}`));
    };
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => fail(`could not start (${error.message})`));
    child.on("exit", (code, signal) => {
      if (pending.size) fail(`exited (${signal ?? code}) before answering`);
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("{")) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        const done = pending.get(message.id);
        if (done && (message.result !== undefined || message.error !== undefined)) {
          pending.delete(message.id);
          done(message);
        }
      }
    });
    const request = (id, method, params) =>
      new Promise((done) => {
        const started = Date.now();
        pending.set(id, (message) => {
          clearTimeout(timer);
          done({ message, seconds: ((Date.now() - started) / 1000).toFixed(1) });
        });
        clearTimeout(timer);
        timer = setTimeout(() => fail(`no answer to ${method} within ${STEP_TIMEOUT_MS / 1000}s`), STEP_TIMEOUT_MS);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });

    (async () => {
      const init = await request(1, "initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
      });
      if (init.message.error) return fail(`initialize failed: ${JSON.stringify(init.message.error)}`);
      console.log(`  initialize: ${init.seconds}s`);
      const session = await request(2, "session/new", { cwd, mcpServers: [] });
      const error = session.message.error;
      console.log(
        `  session/new: ${session.seconds}s, ${error ? `error ${error.code} (${error.data?.message ?? error.message})` : "ok"}`,
      );
      // Anything but an internal crash is fine: without sign-in agents refuse politely.
      if (error && error.code === -32603) return fail(`session/new crashed: ${JSON.stringify(error)}`);
      child.kill("SIGKILL");
      resolve();
    })().catch((error) => fail(error.message));
  });
}

const checks = {
  async antigravity(work) {
    const agent = await registryAgent("antigravity-acp");
    const [program, args] = await installBinary(agent, work);
    await handshake("Antigravity", program, args, work);
  },
  async gemini(work) {
    const agent = await registryAgent("gemini");
    const npx = agent.distribution.npx;
    console.log(`  ${npx.package}`);
    await handshake("Gemini CLI", "npx", ["-y", npx.package, ...(npx.args ?? [])], work);
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(checks);
let failed = false;
for (const name of wanted) {
  if (!checks[name]) {
    console.error(`Unknown agent "${name}". Use: ${Object.keys(checks).join(", ")}`);
    process.exit(2);
  }
  const work = mkdtempSync(path.join(os.tmpdir(), `kontinue-smoke-${name}-`));
  console.log(`${name}:`);
  try {
    await checks[name](work);
    console.log("  passed");
  } catch (error) {
    failed = true;
    console.error(`  FAILED: ${error.message}`);
  }
}
if (failed) process.exit(1);
