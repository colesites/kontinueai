// Snapshots: screen + accessibility tree from the frontmost app, turned into
// the first message of a new thread. Rust: src-tauri/src/snapshot.rs.

import { invoke } from "@tauri-apps/api/core";

export type Snapshot = {
  image: string | null;
  app: string | null;
  window: string | null;
  tree: string;
  notes: string[];
  takenAt: number;
};

export async function captureSnapshot(delayMs = 0): Promise<Snapshot> {
  return invoke<Snapshot>("kode_capture_snapshot", { delayMs });
}

const MAX_TREE_CHARS = 20_000;

/** The thread's first message: the ask, then the screen as text. */
export function snapshotPrompt(snapshot: Snapshot, ask: string, savedImage: string | null): string {
  const where = [snapshot.app, snapshot.window].filter(Boolean).join(" · ") || "the screen";
  const lines = [ask.trim() || "Look at this screen and tell me what you see.", "", `## Snapshot of ${where}`, `Taken ${new Date(snapshot.takenAt).toLocaleString()}.`];
  if (savedImage) lines.push(`The screenshot is attached and saved at ${savedImage}.`);
  if (snapshot.tree.trim()) {
    const tree = snapshot.tree.length > MAX_TREE_CHARS ? `${snapshot.tree.slice(0, MAX_TREE_CHARS)}\n…` : snapshot.tree;
    lines.push("", "Accessibility tree (role \"label\"):", "```", tree.trimEnd(), "```");
  }
  if (snapshot.notes.length) lines.push("", ...snapshot.notes.map((note) => `Note: ${note}`));
  return lines.join("\n");
}

/** Downscale a PNG (base64) to a JPEG data URL small enough to queue. */
export async function shrinkImage(base64: string, maxWidth = 1440): Promise<string> {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}
