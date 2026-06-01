// Long-form K-Video rendering pipeline (runs on Render — has ffmpeg + no
// serverless time limit). A single Veo call only produces a short clip (~8s),
// so for longer durations we: storyboard → generate per-scene clips → ffmpeg
// concat → upload. Progress is reported back to the web app via a callback.

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText, experimental_generateVideo as generateVideo } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { put } from "@vercel/blob";

const VEO_MODEL = "google/veo-3.1-fast";
const SCENE_SECONDS = 8; // Veo's practical per-clip max.
const K_AI_MODEL = "google/gemma-4-31b-it:free";

export interface LongVideoRequest {
  jobId: string;
  prompt: string;
  durationSec: number;
  resolution: string; // e.g. "1920x1080"
  aspectRatio: string; // e.g. "16:9"
  audio: boolean;
  openRouterKey: string;
  blobToken: string;
  // Where to POST progress/result; secured by callbackSecret.
  callbackUrl: string;
  callbackSecret: string;
}

type JobStatus = "processing" | "completed" | "failed";

async function reportProgress(
  req: LongVideoRequest,
  body: {
    status: JobStatus;
    progress?: number; // 0..100
    stage?: string;
    finalUrl?: string;
    error?: string;
  },
): Promise<void> {
  try {
    await fetch(req.callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-secret": req.callbackSecret,
      },
      body: JSON.stringify({ jobId: req.jobId, ...body }),
    });
  } catch (err) {
    console.error("[longform] progress callback failed", err);
  }
}

// Ask K-AI for N concise, visually-consistent scene prompts.
async function buildStoryboard(
  prompt: string,
  sceneCount: number,
  openRouterKey: string,
): Promise<string[]> {
  const fallback = Array.from(
    { length: sceneCount },
    (_, i) => `${prompt} — scene ${i + 1} of ${sceneCount}, continuous sequence.`,
  );
  try {
    const openrouter = createOpenRouter({ apiKey: openRouterKey });
    const { text } = await generateText({
      model: openrouter.chat(K_AI_MODEL),
      prompt: [
        `Break this video idea into exactly ${sceneCount} sequential ${SCENE_SECONDS}-second scenes.`,
        `Keep characters, style and setting CONSISTENT across scenes.`,
        `Return ONLY the scene descriptions, one per line, no numbering.`,
        ``,
        `Video idea: ${prompt}`,
      ].join("\n"),
      maxOutputTokens: 600,
    });
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean);
    return lines.length >= sceneCount ? lines.slice(0, sceneCount) : fallback;
  } catch (err) {
    console.error("[longform] storyboard generation failed, using fallback", err);
    return fallback;
  }
}

// Generate one scene clip via OpenRouter Veo; returns the raw mp4 bytes.
async function generateSceneClip(
  scenePrompt: string,
  req: LongVideoRequest,
): Promise<Uint8Array> {
  const openrouter = createOpenRouter({ apiKey: req.openRouterKey });
  const result = await generateVideo({
    model: openrouter.videoModel(VEO_MODEL, {
      generateAudio: req.audio,
      maxPollTimeMs: 600000,
    }),
    prompt: scenePrompt,
    duration: SCENE_SECONDS,
    resolution: req.resolution as `${number}x${number}`,
    aspectRatio: req.aspectRatio as `${number}:${number}`,
  });
  if (!result.video) throw new Error("Veo returned no video for a scene");
  return result.video.uint8Array;
}

// Concatenate the scene clips into one mp4 using ffmpeg (re-encode so clips with
// slightly different params still join cleanly).
async function concatClips(clips: Uint8Array[]): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "kvideo-"));
  try {
    const paths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const p = join(dir, `scene_${i}.mp4`);
      await writeFile(p, clips[i]!);
      paths.push(p);
    }
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, paths.map((p) => `file '${p}'`).join("\n"));
    const outPath = join(dir, "final.mp4");

    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-pix_fmt",
        "yuv420p",
        outPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const exit = await proc.exited;
    if (exit !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`ffmpeg concat failed (${exit}): ${err.slice(-500)}`);
    }
    return new Uint8Array(await Bun.file(outPath).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Orchestrate the whole job. Designed to run detached (fire-and-forget) — it
// reports progress + the final URL through the callback.
export async function runLongVideoJob(req: LongVideoRequest): Promise<void> {
  const sceneCount = Math.max(1, Math.ceil(req.durationSec / SCENE_SECONDS));
  try {
    await reportProgress(req, {
      status: "processing",
      progress: 5,
      stage: "storyboard",
    });
    const scenes = await buildStoryboard(
      req.prompt,
      sceneCount,
      req.openRouterKey,
    );

    const clips: Uint8Array[] = [];
    for (let i = 0; i < scenes.length; i++) {
      await reportProgress(req, {
        status: "processing",
        progress: 5 + Math.round((i / scenes.length) * 80),
        stage: `Generating scene ${i + 1} of ${scenes.length}`,
      });
      clips.push(await generateSceneClip(scenes[i]!, req));
    }

    await reportProgress(req, {
      status: "processing",
      progress: 88,
      stage: "Merging clips",
    });
    const finalBytes =
      clips.length === 1 ? clips[0]! : await concatClips(clips);

    await reportProgress(req, {
      status: "processing",
      progress: 95,
      stage: "Uploading",
    });
    const blob = await put(
      `canvas/kvideo_${req.jobId}.mp4`,
      Buffer.from(finalBytes),
      { access: "public", contentType: "video/mp4", token: req.blobToken },
    );

    await reportProgress(req, {
      status: "completed",
      progress: 100,
      stage: "Done",
      finalUrl: blob.url,
    });
  } catch (err) {
    console.error("[longform] job failed", err);
    await reportProgress(req, {
      status: "failed",
      error: err instanceof Error ? err.message : "Render failed",
    });
  }
}
